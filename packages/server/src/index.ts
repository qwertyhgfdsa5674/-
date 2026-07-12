import { Queue } from "bullmq";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { Redis } from "ioredis";
import { timingSafeEqual } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { z } from "zod";

import { AbTestAnalyzer, ContentVariantSchema } from "@ai-ecommerce/ab-test";
import { createIdempotencyKey } from "@ai-ecommerce/core";
import {
  createDefaultTrendSources,
  EventCalendar,
  TrendAggregator
} from "@ai-ecommerce/data-pipeline";
import {
  DynamicPricingEngine,
  PricingInputSchema
} from "@ai-ecommerce/dynamic-pricing";
import {
  InventoryInputSchema,
  InventoryPlanner
} from "@ai-ecommerce/inventory-planner";
import {
  ComplianceInputSchema,
  ComplianceScanner
} from "@ai-ecommerce/risk-control";
import { loadConfig, type AppConfig } from "./config.js";
import { DEFAULT_REDIS_URL } from "./constants.js";

type Db = Sql<Record<string, never>>;

type RedisHealthClient = {
  ping: () => Promise<string>;
  disconnect: () => void;
};

interface ServerDependencies {
  sql?: Db;
  redis?: RedisHealthClient;
}

type DatabaseSource<T> = {
  sourceType: "database";
} & T;

type MockSource<T> = {
  sourceType: "mock";
} & T;

interface DataHealthTable {
  table: string;
  status: "ok" | "empty" | "missing" | "error";
  rowCount: number | null;
  error?: string;
}

interface DataHealth {
  sourceType: "database" | "mock";
  database: {
    configured: boolean;
    connected: boolean;
    status: "ok" | "unconfigured" | "error";
    error?: string;
  };
  tables: DataHealthTable[];
  summary: {
    emptyTables: number;
    missingTables: number;
    errorTables: number;
  };
}

interface DependencyHealth {
  configured: boolean;
  status: "ok" | "unconfigured" | "error";
  error?: string;
}

const HEALTH_CHECK_TABLES = [
  "products",
  "suppliers",
  "orders",
  "pricing",
  "listing_tasks",
  "price_history",
  "compliance_checks",
  "ab_tests",
  "inventory_alerts",
  "review_insights",
  "supplier_alternatives",
  "supplier_performance"
];

export async function createServer(
  config: AppConfig = loadConfig(),
  dependencies: ServerDependencies = {}
) {
  const apiKey = process.env["API_KEY"];

  if (process.env["NODE_ENV"] === "production" && !apiKey) {
    throw new Error("API_KEY is required in production");
  }

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env["NODE_ENV"] === "production" || config.logLevel === "silent"
          ? undefined
          : { target: "pino-pretty" }
    }
  });
  const sql =
    "sql" in dependencies ? dependencies.sql : createDatabaseConnection();
  const redis = dependencies.redis;
  const trendAggregator = new TrendAggregator();
  const calendar = new EventCalendar();
  const pricing = new DynamicPricingEngine();
  const inventory = new InventoryPlanner();
  const compliance = new ComplianceScanner();
  const abTests = new AbTestAnalyzer();

  app.addHook("onClose", async () => {
    const closeableSql = sql as (Db & { end?: () => Promise<void> }) | undefined;
    await closeableSql?.end?.();
    redis?.disconnect();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ServiceUnavailableError) {
      request.log.error({ err: error }, error.message);
      return reply.status(503).send({ error: error.message });
    }

    return reply.send(error);
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!isProtectedRoute(request.url)) {
      return;
    }

    if (!apiKey) {
      request.log.error("API_KEY not set, protected route is unavailable");
      return reply
        .status(503)
        .send({ error: "API authentication is not configured" });
    }

    if (!hasValidBearerToken(request.headers.authorization, apiKey)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "AI Ecommerce API",
        version: "0.1.0"
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  app.get("/health", async () => liveHealth());

  app.get("/health/live", async () => liveHealth());

  app.get("/health/ready", async (request, reply) => {
    const [database, redisHealth] = await Promise.all([
      checkDatabase(sql),
      checkRedis(redis, config.redisUrl)
    ]);
    const ok = database.status === "ok" && redisHealth.status === "ok";
    const payload = {
      ok,
      service: "ai-ecommerce-server",
      checks: {
        database,
        redis: redisHealth
      }
    };

    if (!ok) {
      request.log.error({ checks: payload.checks }, "readiness check failed");
      return reply.status(503).send(payload);
    }

    return payload;
  });

  function liveHealth() {
    return {
    ok: true,
    service: "ai-ecommerce-server",
    checks: {
      http: "ok"
    }
    };
  }

  app.get(
    "/api/diagnostics/data-health",
    {
      schema: {
        description: "Inspect database connectivity and core table population.",
        tags: ["diagnostics"],
        response: {
          200: {
            type: "object",
            properties: {
              sourceType: { type: "string", enum: ["database", "mock"] },
              database: {
                type: "object",
                properties: {
                  configured: { type: "boolean" },
                  connected: { type: "boolean" },
                  status: {
                    type: "string",
                    enum: ["ok", "unconfigured", "error"]
                  },
                  error: { type: "string" }
                },
                required: ["configured", "connected", "status"]
              },
              tables: { type: "array" },
              summary: {
                type: "object",
                properties: {
                  emptyTables: { type: "number" },
                  missingTables: { type: "number" },
                  errorTables: { type: "number" }
                },
                required: ["emptyTables", "missingTables", "errorTables"]
              }
            },
            required: ["sourceType", "database", "tables", "summary"]
          }
        }
      }
    },
    async (request) => {
      const health = await queryDataHealth(sql);
      request.log.info(
        {
          sourceType: health.sourceType,
          databaseStatus: health.database.status,
          summary: health.summary
        },
        "data health checked"
      );
      return health;
    }
  );

  app.get("/api/trends", async () => {
    const trends = await trendAggregator.collectAndAggregate(
      createDefaultTrendSources()
    );

    return {
      sourceType: "mock" as const,
      trends
    };
  });

  app.get("/api/events", async () => ({
    events: calendar.list(),
    upcoming: calendar.upcoming()
  }));

  app.get("/api/dashboard", async () => {
    return withDatabaseFallback(app, "dashboard", sql, queryDashboard, mockDashboard);
  });

  app.get("/api/products", async () => {
    const result = await withDatabaseFallback(
      app,
      "products",
      sql,
      queryProducts,
      () => ({ products: mockProducts() })
    );

    return {
      sourceType: result.sourceType,
      products: result.products
    };
  });

  app.get("/api/orders", async () => {
    const result = await withDatabaseFallback(
      app,
      "orders",
      sql,
      queryOrders,
      () => ({ orders: mockOrders() })
    );

    return {
      sourceType: result.sourceType,
      orders: result.orders
    };
  });

  app.get("/api/sourcing", async () => {
    return withDatabaseFallback(app, "sourcing", sql, querySourcing, mockSourcing);
  });

  app.get("/api/analytics", async () => {
    return withDatabaseFallback(app, "analytics", sql, queryAnalytics, mockAnalytics);
  });

  app.post("/api/pricing/recommend", async (request) => {
    const body = PricingInputSchema.parse(request.body);
    return pricing.recommend(body);
  });

  app.post("/api/inventory/forecast", async (request) => {
    const body = InventoryInputSchema.parse(request.body);
    return inventory.forecast(body);
  });

  app.post("/api/compliance/check", async (request) => {
    const body = ComplianceInputSchema.parse(request.body);
    return compliance.scan(body);
  });

  app.post("/api/ab-tests/winner", async (request) => {
    const body = z
      .object({
        variants: z.array(ContentVariantSchema).default([]),
        minImpressions: z.number().int().positive().optional()
      })
      .parse(request.body);
    return abTests.pickWinner(body.variants, body.minImpressions);
  });

  return app;
}

export function createDefaultQueue(redisUrl = DEFAULT_REDIS_URL) {
  return new Queue("ai-ecommerce-jobs", {
    connection: {
      url: redisUrl
    }
  });
}

export { createIdempotencyKey };
export * from "./workers/order-fulfillment.js";

function createDatabaseConnection(): Db | undefined {
  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    return undefined;
  }

  return postgres(databaseUrl, { max: 5 });
}

function createRedisConnection(redisUrl: string): RedisHealthClient {
  return new Redis(redisUrl, {
    connectTimeout: 1000,
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });
}

function isProtectedRoute(url: string): boolean {
  const pathname = url.split("?", 1)[0] ?? "/";

  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/")
  );
}

function hasValidBearerToken(
  authorization: string | undefined,
  apiKey: string
): boolean {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return false;
  }

  const tokenBuffer = Buffer.from(token);
  const apiKeyBuffer = Buffer.from(apiKey);

  return (
    tokenBuffer.length === apiKeyBuffer.length &&
    timingSafeEqual(tokenBuffer, apiKeyBuffer)
  );
}

async function checkDatabase(sql: Db | undefined): Promise<DependencyHealth> {
  if (!sql) {
    return {
      configured: false,
      status: "unconfigured"
    };
  }

  try {
    await sql`select 1`;
    return {
      configured: true,
      status: "ok"
    };
  } catch (error) {
    return {
      configured: true,
      status: "error",
      error: errorMessage(error)
    };
  }
}

async function checkRedis(
  redis: RedisHealthClient | undefined,
  redisUrl: string
): Promise<DependencyHealth> {
  if (!redisUrl) {
    return {
      configured: false,
      status: "unconfigured"
    };
  }

  const client = redis ?? createRedisConnection(redisUrl);

  try {
    await client.ping();
    return {
      configured: true,
      status: "ok"
    };
  } catch (error) {
    return {
      configured: true,
      status: "error",
      error: errorMessage(error)
    };
  } finally {
    if (!redis) {
      client.disconnect();
    }
  }
}

async function queryDataHealth(sql: Db | undefined): Promise<DataHealth> {
  if (!sql) {
    return {
      sourceType: dataHealthSourceType(),
      database: {
        configured: false,
        connected: false,
        status: "unconfigured"
      },
      tables: HEALTH_CHECK_TABLES.map((table) => ({
        table,
        status: "missing",
        rowCount: null
      })),
      summary: {
        emptyTables: 0,
        missingTables: HEALTH_CHECK_TABLES.length,
        errorTables: 0
      }
    };
  }

  try {
    await sql`select 1`;
  } catch (error) {
    return {
      sourceType: dataHealthSourceType(),
      database: {
        configured: true,
        connected: false,
        status: "error",
        error: errorMessage(error)
      },
      tables: HEALTH_CHECK_TABLES.map((table) => ({
        table,
        status: "error",
        rowCount: null,
        error: "Database connection failed"
      })),
      summary: {
        emptyTables: 0,
        missingTables: 0,
        errorTables: HEALTH_CHECK_TABLES.length
      }
    };
  }

  const tables = await Promise.all(
    HEALTH_CHECK_TABLES.map((table) => queryTableHealth(sql, table))
  );

  return {
    sourceType: "database",
    database: {
      configured: true,
      connected: true,
      status: "ok"
    },
    tables,
    summary: {
      emptyTables: tables.filter((table) => table.status === "empty").length,
      missingTables: tables.filter((table) => table.status === "missing")
        .length,
      errorTables: tables.filter((table) => table.status === "error").length
    }
  };
}

async function queryTableHealth(
  sql: Db,
  table: string
): Promise<DataHealthTable> {
  try {
    const [exists] = await sql<{ exists: boolean }[]>`
      select to_regclass(${`public.${table}`}) is not null as exists
    `;

    if (!exists?.exists) {
      return {
        table,
        status: "missing",
        rowCount: null
      };
    }

    const [row] = await sql<{ row_count: string }[]>`
      select count(*)::text as row_count from ${sql(table)}
    `;
    const rowCount = Number(row?.row_count ?? 0);

    return {
      table,
      status: rowCount > 0 ? "ok" : "empty",
      rowCount
    };
  } catch (error) {
    return {
      table,
      status: "error",
      rowCount: null,
      error: errorMessage(error)
    };
  }
}

async function withDatabaseFallback<T>(
  app: ReturnType<typeof Fastify>,
  route: string,
  sql: Db | undefined,
  query: (db: Db) => Promise<T>,
  fallback: () => T
): Promise<DatabaseSource<T> | MockSource<T>> {
  if (!sql) {
    if (!canUseMockData()) {
      app.log.error({ route }, `${route} query failed, database unavailable`);
      throw new ServiceUnavailableError("Database unavailable");
    }

    return { sourceType: "mock", ...fallback() };
  }

  try {
    return {
      sourceType: "database",
      ...(await query(sql))
    };
  } catch (error) {
    if (!canUseMockData()) {
      app.log.error(
        { err: error, route },
        `${route} query failed, database unavailable`
      );
      throw new ServiceUnavailableError("Database unavailable");
    }

    app.log.warn(
      { err: error, route },
      `${route} query failed, using mock data`
    );
    return { sourceType: "mock", ...fallback() };
  }
}

function canUseMockData(): boolean {
  const env = process.env["NODE_ENV"] ?? "development";
  return env === "development" || env === "test" || env === "demo";
}

function dataHealthSourceType(): "database" | "mock" {
  return canUseMockData() ? "mock" : "database";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class ServiceUnavailableError extends Error {}

async function queryDashboard(sql: Db): Promise<{
  metrics: {
    todayOrders: MetricCard;
    todaySales: MetricCard;
    activeProducts: MetricCard;
    profit: MetricCard;
  };
  salesTrend: SalesPoint[];
  pendingOrders: Order[];
  inventoryAlerts: Product[];
}> {
  const [metricRow] = await sql<{
    today_orders: string;
    today_sales: string;
    active_products: string;
    profit: string;
    pending_orders: string;
    inventory_alerts: string;
  }[]>`
    select
      count(*) filter (where o.created_at >= now() - interval '1 day')::text as today_orders,
      coalesce(sum(o.quantity * p.list_price_cents), 0)::text as today_sales,
      count(distinct pr.product_id)::text as active_products,
      coalesce(sum(o.quantity * (p.list_price_cents - p.cost_cents)) filter (where o.status = 'fulfilled' and o.created_at >= now() - interval '1 day'), 0)::text as profit,
      count(*) filter (where o.status in ('pending', 'paid'))::text as pending_orders,
      count(*) filter (where ia.resolved = false)::text as inventory_alerts
    from products pr
    left join pricing p on p.product_id = pr.id
    left join orders o on o.product_id = pr.id
    left join inventory_alerts ia on ia.product_id = pr.id
  `;

  const salesTrend = await querySalesTrend(sql);
  const pendingOrders = (await queryOrders(sql)).orders.slice(0, 2);
  const inventoryAlerts = await queryInventoryAlerts(sql);

  return {
    metrics: {
      todayOrders: {
        label: "Today orders",
        value: Number(metricRow?.today_orders ?? 0),
        delta: 12
      },
      todaySales: {
        label: "Today GMV",
        value: Number(metricRow?.today_sales ?? 0),
        delta: 8
      },
      activeProducts: {
        label: "Active products",
        value: Number(metricRow?.active_products ?? 0),
        delta: 3
      },
      profit: {
        label: "Profit",
        value: Number(metricRow?.profit ?? 0),
        delta: 5
      }
    },
    salesTrend,
    pendingOrders,
    inventoryAlerts
  };
}

async function queryProducts(sql: Db): Promise<{ products: Product[] }> {
  const rows = await sql<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    source_url: string | null;
    updated_at: Date;
    cost_cents: number | null;
    list_price_cents: number | null;
  }[]>`
    select
      p.id::text as id,
      p.title,
      p.description,
      p.status,
      p.source_url,
      p.updated_at,
      pr.cost_cents,
      pr.list_price_cents
    from products p
    left join pricing pr on pr.product_id = p.id
    order by p.updated_at desc
  `;

  return {
    products: rows.map((row, index) => ({
      id: row.id,
      image: productImage(index),
      title: row.title,
      platform: "douyin",
      price: Math.round((row.list_price_cents ?? 0) / 100),
      cost: Math.round((row.cost_cents ?? 0) / 100),
      stock: 0,
      status: mapProductStatus(row.status),
      links: {},
      category: row.description?.slice(0, 24) || "general",
      updatedAt: row.updated_at.toISOString()
    }))
  };
}

async function queryOrders(sql: Db): Promise<{ orders: Order[] }> {
  const rows = await sql<{
    id: string;
    platform: string;
    external_order_id: string;
    quantity: number;
    status: string;
    created_at: Date;
    title: string | null;
    list_price_cents: number | null;
    cost_cents: number | null;
  }[]>`
    select
      o.id::text as id,
      o.platform,
      o.external_order_id,
      o.quantity,
      o.status,
      o.created_at,
      p.title,
      pr.list_price_cents,
      pr.cost_cents
    from orders o
    left join products p on p.id = o.product_id
    left join pricing pr on pr.product_id = o.product_id
    order by o.created_at desc
    limit 50
  `;

  return {
    orders: rows.map((row) => {
      const amount = Math.round(
        (row.list_price_cents ?? 0) * row.quantity / 100
      );
      const profit = Math.round(
        ((row.list_price_cents ?? 0) - (row.cost_cents ?? 0)) * row.quantity / 100
      );

      return {
        id: row.id,
        platform: normalizePlatform(row.platform),
        buyer: row.external_order_id,
        phone: "[REDACTED]",
        address: "[REDACTED]",
        productTitle: row.title ?? "Unknown product",
        amount,
        profit,
        status: mapOrderStatus(row.status),
        trackingNumber: undefined,
        logisticsCompany: undefined,
        createdAt: row.created_at.toISOString(),
        timeline: [
          {
            status: mapOrderStatus(row.status),
            at: row.created_at.toISOString(),
            description: "Loaded from PostgreSQL."
          }
        ]
      };
    })
  };
}

async function querySourcing(sql: Db): Promise<{
  trend: SalesPoint[];
  keywords: KeywordTrend[];
  results: SourcingProduct[];
}> {
  const [trend, keywords, products] = await Promise.all([
    querySalesTrend(sql),
    queryTrendKeywords(sql),
    sql<{
      id: string;
      title: string;
      cost_cents: number | null;
      list_price_cents: number | null;
      updated_at: Date;
    }[]>`
      select
        p.id::text as id,
        p.title,
        pr.cost_cents,
        pr.list_price_cents,
        p.updated_at
      from products p
      left join pricing pr on pr.product_id = p.id
      order by p.updated_at desc
      limit 12
    `
  ]);

  return {
    trend,
    keywords,
    results: products.map((product, index) => ({
      id: product.id,
      image: productImage(index),
      title: product.title,
      price: Math.round((product.cost_cents ?? 0) / 100),
      monthlySales: 0,
      supplier: "PostgreSQL",
      score: 50,
      profitMargin:
        product.list_price_cents && product.cost_cents
          ? (product.list_price_cents - product.cost_cents) /
            Math.max(product.list_price_cents, 1)
          : 0,
      stock: 0,
      tags: ["database"],
      details: {
        priceCompetitiveness: 50,
        supplierReliability: 50,
        productQuality: 50,
        fulfillmentCapability: 50,
        profitMargin: 50
      }
    }))
  };
}

async function queryAnalytics(sql: Db): Promise<{
  salesTrend: SalesPoint[];
  productRanking: Array<{ title: string; sales: number; revenue: number }>;
  platformShare: Array<{ platform: "douyin" | "pdd" | "taobao"; value: number }>;
  profitReport: Array<{ date: string; revenue: number; cost: number; profit: number }>;
}> {
  const [salesTrend, productRanking, platformShare, profitReport] =
    await Promise.all([
      querySalesTrend(sql),
      sql<{
        title: string;
        sales: string;
        revenue: string;
      }[]>`
        select
          coalesce(p.title, 'Unknown product') as title,
          sum(o.quantity)::text as sales,
          coalesce(sum(o.quantity * coalesce(pr.list_price_cents, 0)), 0)::text as revenue
        from orders o
        left join products p on p.id = o.product_id
        left join pricing pr on pr.product_id = o.product_id
        group by p.title
        order by revenue desc
        limit 10
      `,
      sql<{
        platform: string;
        value: string;
      }[]>`
        select
          o.platform,
          count(*)::text as value
        from orders o
        group by o.platform
      `,
      sql<{
        date: string;
        revenue: string;
        cost: string;
        profit: string;
      }[]>`
        select
          to_char(o.created_at::date, 'YYYY-MM-DD') as date,
          coalesce(sum(o.quantity * coalesce(pr.list_price_cents, 0)), 0)::text as revenue,
          coalesce(sum(o.quantity * coalesce(pr.cost_cents, 0)), 0)::text as cost,
          coalesce(sum(o.quantity * (coalesce(pr.list_price_cents, 0) - coalesce(pr.cost_cents, 0))), 0)::text as profit
        from orders o
        left join pricing pr on pr.product_id = o.product_id
        group by o.created_at::date
        order by date desc
        limit 7
      `
    ]);

  return {
    salesTrend,
    productRanking: productRanking.map((item) => ({
      title: item.title,
      sales: Number(item.sales ?? 0),
      revenue: Number(item.revenue ?? 0)
    })),
    platformShare: platformShare.map((item) => ({
      platform: normalizePlatform(item.platform),
      value: Number(item.value ?? 0)
    })),
    profitReport: profitReport.map((item) => ({
      date: item.date,
      revenue: Number(item.revenue ?? 0),
      cost: Number(item.cost ?? 0),
      profit: Number(item.profit ?? 0)
    }))
  };
}

async function querySalesTrend(sql: Db): Promise<SalesPoint[]> {
  const rows = await sql<{
    date: string;
    douyin: string;
    pdd: string;
    taobao: string;
    total: string;
    profit: string;
  }[]>`
    select
      coalesce(to_char(o.created_at::date, 'YYYY-MM-DD'), to_char(now()::date, 'YYYY-MM-DD')) as date,
      coalesce(sum(case when o.platform = 'douyin' then o.quantity * coalesce(pr.list_price_cents, 0) else 0 end), 0)::text as douyin,
      coalesce(sum(case when o.platform = 'pdd' then o.quantity * coalesce(pr.list_price_cents, 0) else 0 end), 0)::text as pdd,
      coalesce(sum(case when o.platform = 'taobao' then o.quantity * coalesce(pr.list_price_cents, 0) else 0 end), 0)::text as taobao,
      coalesce(sum(o.quantity * coalesce(pr.list_price_cents, 0)), 0)::text as total,
      coalesce(sum(o.quantity * (coalesce(pr.list_price_cents, 0) - coalesce(pr.cost_cents, 0))), 0)::text as profit
    from orders o
    left join pricing pr on pr.product_id = o.product_id
    where o.created_at >= now() - interval '7 days'
    group by o.created_at::date
    order by date asc
  `;

  return rows.map((row) => ({
    date: row.date,
    douyin: Number(row.douyin ?? 0),
    pdd: Number(row.pdd ?? 0),
    taobao: Number(row.taobao ?? 0),
    total: Number(row.total ?? 0),
    profit: Number(row.profit ?? 0)
  }));
}

async function queryTrendKeywords(sql: Db): Promise<KeywordTrend[]> {
  const rows = await sql<{
    keyword: string;
    score: number;
    growth_rate: number | null;
  }[]>`
    select keyword, score, growth_rate
    from trends
    order by score desc, keyword asc
    limit 8
  `;

  return rows.map((row) => ({
    keyword: row.keyword,
    searchVolume: Math.max(row.score, 0) * 1000,
    growth: row.growth_rate ?? 0
  }));
}

async function queryInventoryAlerts(sql: Db): Promise<Product[]> {
  const rows = await sql<{
    id: string;
    title: string;
    platform: string;
    cost_cents: number | null;
    list_price_cents: number | null;
  }[]>`
    select
      p.id::text as id,
      p.title,
      'douyin' as platform,
      pr.cost_cents,
      pr.list_price_cents
    from inventory_alerts ia
    join products p on p.id = ia.product_id
    left join pricing pr on pr.product_id = p.id
    where ia.resolved = false
    order by ia.created_at desc
    limit 8
  `;

  return rows.map((row, index) => ({
    id: row.id,
    image: productImage(index),
    title: row.title,
    platform: normalizePlatform(row.platform),
    price: Math.round((row.list_price_cents ?? 0) / 100),
    cost: Math.round((row.cost_cents ?? 0) / 100),
    stock: 0,
    status: "paused",
    links: {},
    category: "database",
    updatedAt: new Date().toISOString()
  }));
}

function mockDashboard(): {
  metrics: {
    todayOrders: MetricCard;
    todaySales: MetricCard;
    activeProducts: MetricCard;
    profit: MetricCard;
  };
  salesTrend: SalesPoint[];
  pendingOrders: Order[];
  inventoryAlerts: Product[];
} {
  return {
    metrics: {
      todayOrders: { label: "Today orders", value: 238, delta: 12 },
      todaySales: { label: "Today GMV", value: 128600, delta: 8 },
      activeProducts: { label: "Active products", value: 1860, delta: 3 },
      profit: { label: "Profit", value: 32600, delta: 5 }
    },
    salesTrend: mockSalesTrend(),
    pendingOrders: mockOrders().slice(0, 2),
    inventoryAlerts: mockProducts().slice(0, 2)
  };
}

function mockProducts(): Product[] {
  return [
    {
      id: "prod-1",
      image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7",
      title: "Portable desk fan",
      platform: "douyin",
      price: 69,
      cost: 28,
      stock: 168,
      status: "active",
      links: { douyin: "douyin-prod-1", pdd: "pdd-prod-1" },
      category: "summer",
      updatedAt: new Date().toISOString()
    },
    {
      id: "prod-2",
      image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64",
      title: "Dorm storage box",
      platform: "pdd",
      price: 39,
      cost: 14,
      stock: 42,
      status: "active",
      links: { pdd: "pdd-prod-2", taobao: "taobao-prod-2" },
      category: "education",
      updatedAt: new Date().toISOString()
    }
  ];
}

function mockOrders(): Order[] {
  return [
    {
      id: "order-1",
      platform: "douyin",
      buyer: "Buyer A",
      phone: "[REDACTED]",
      address: "[REDACTED]",
      productTitle: "Portable desk fan",
      amount: 138,
      profit: 48,
      status: "completed",
      createdAt: new Date().toISOString(),
      timeline: [
        {
          status: "completed",
          at: new Date().toISOString(),
          description: "Payment received."
        }
      ]
    },
    {
      id: "order-2",
      platform: "pdd",
      buyer: "Buyer B",
      phone: "[REDACTED]",
      address: "[REDACTED]",
      productTitle: "Dorm storage box",
      amount: 78,
      profit: 28,
      status: "purchasing",
      createdAt: new Date().toISOString(),
      timeline: [
        {
          status: "purchasing",
          at: new Date().toISOString(),
          description: "Supplier order is being prepared."
        }
      ]
    }
  ];
}

function mockSourcing(): {
  trend: SalesPoint[];
  keywords: KeywordTrend[];
  results: SourcingProduct[];
} {
  return {
    trend: mockSalesTrend(),
    keywords: [
      { keyword: "mini fan", searchVolume: 88000, growth: 32 },
      { keyword: "back to school", searchVolume: 64000, growth: 24 }
    ],
    results: [
      {
        id: "source-1",
        image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7",
        title: "Portable desk fan",
        price: 28,
        monthlySales: 8400,
        supplier: "Yiwu Supplier A",
        score: 88,
        profitMargin: 0.41,
        stock: 6000,
        tags: ["summer", "trend"],
        details: {
          priceCompetitiveness: 82,
          supplierReliability: 86,
          productQuality: 78,
          fulfillmentCapability: 92,
          profitMargin: 80,
          trendTimeliness: 91
        }
      }
    ]
  };
}

function mockAnalytics(): {
  salesTrend: SalesPoint[];
  productRanking: Array<{ title: string; sales: number; revenue: number }>;
  platformShare: Array<{ platform: "douyin" | "pdd" | "taobao"; value: number }>;
  profitReport: Array<{
    date: string;
    revenue: number;
    cost: number;
    profit: number;
  }>;
} {
  return {
    salesTrend: mockSalesTrend(),
    productRanking: [
      { title: "Portable desk fan", sales: 1200, revenue: 82800 },
      { title: "Dorm storage box", sales: 860, revenue: 33540 }
    ],
    platformShare: [
      { platform: "douyin", value: 45 },
      { platform: "pdd", value: 35 },
      { platform: "taobao", value: 20 }
    ],
    profitReport: mockSalesTrend().map((point) => ({
      date: point.date,
      revenue: point.total,
      cost: point.total - point.profit,
      profit: point.profit
    }))
  };
}

function mockSalesTrend() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const douyin = 18000 + index * 1500;
    const pdd = 12000 + index * 900;
    const taobao = 8000 + index * 700;
    const total = douyin + pdd + taobao;
    return {
      date,
      douyin,
      pdd,
      taobao,
      total,
      profit: Math.round(total * 0.24)
    };
  });
}

function mapProductStatus(status: string): "draft" | "active" | "paused" {
  if (status === "active") return "active";
  if (status === "archived") return "paused";
  return "draft";
}

function mapOrderStatus(
  status: string
): "pending" | "sourcing" | "purchasing" | "shipped" | "completed" | "aftersale" | "failed" {
  if (status === "fulfilled") return "completed";
  if (status === "paid") return "purchasing";
  if (status === "cancelled" || status === "refunded") return "failed";
  return "pending";
}

function normalizePlatform(platform: string): "douyin" | "pdd" | "taobao" {
  if (platform === "pdd") return "pdd";
  if (platform === "taobao") return "taobao";
  return "douyin";
}

function productImage(index: number): string {
  return index % 2 === 0
    ? "https://images.unsplash.com/photo-1586023492125-27b2c045efd7"
    : "https://images.unsplash.com/photo-1558618666-fcd25c85cd64";
}

interface MetricCard {
  label: string;
  value: number;
  delta: number;
}

interface SalesPoint {
  date: string;
  douyin: number;
  pdd: number;
  taobao: number;
  total: number;
  profit: number;
}

interface Product {
  id: string;
  image: string;
  title: string;
  platform: "douyin" | "pdd" | "taobao";
  price: number;
  cost: number;
  stock: number;
  status: "draft" | "active" | "paused";
  links: Partial<Record<"douyin" | "pdd" | "taobao", string>>;
  category: string;
  updatedAt: string;
}

interface Order {
  id: string;
  platform: "douyin" | "pdd" | "taobao";
  buyer: string;
  phone: string;
  address: string;
  productTitle: string;
  amount: number;
  profit: number;
  status: "pending" | "sourcing" | "purchasing" | "shipped" | "completed" | "aftersale" | "failed";
  trackingNumber?: string;
  logisticsCompany?: string;
  createdAt: string;
  timeline: Array<{
    status: string;
    at: string;
    description: string;
  }>;
}

interface KeywordTrend {
  keyword: string;
  searchVolume: number;
  growth: number;
}

interface SourcingProduct {
  id: string;
  image: string;
  title: string;
  price: number;
  monthlySales: number;
  supplier: string;
  score: number;
  profitMargin: number;
  stock: number;
  tags: string[];
  details: Record<string, number>;
}
