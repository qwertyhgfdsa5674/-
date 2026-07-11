# Business Integration Test Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-phase business integration test gate that proves platform client contracts, database migrations, and authenticated server business APIs work against realistic boundaries.

**Architecture:** Keep fast unit tests in place and add explicit integration suites for service-backed behavior. Extract the core migrator into a reusable function, seed real PostgreSQL data for server API tests, keep marketplace tests mocked at the fetch boundary, and wire a dedicated CI job with PostgreSQL and Redis services.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Fastify inject, postgres.js, GitHub Actions services, Node 22.

---

## File Structure

- Modify `packages/core/src/db/migrate.ts`: export a reusable `runMigrations` function while preserving CLI behavior.
- Modify `packages/core/src/index.ts`: export migration runner for cross-package integration tests.
- Create `packages/core/test/migrate.integration.test.ts`: apply migrations against real PostgreSQL and verify idempotency/schema constraints.
- Modify `packages/core/package.json`: add `test:integration`.
- Create `packages/server/test/helpers/database.ts`: reset schema and seed deterministic business data.
- Create `packages/server/test/business-api.integration.test.ts`: verify authenticated database-backed API responses.
- Modify `packages/server/package.json`: add `test:integration`.
- Create `packages/platforms/pdd/test/client-contract.test.ts`: verify PDD client request/response/error/retry contracts.
- Create `packages/platforms/alibaba1688/test/client-contract.test.ts`: verify Alibaba 1688 client request/response/error/retry contracts.
- Modify `packages/web/src/api/client.test.ts`: add the missing non-2xx error contract regression.
- Modify root `package.json`: add `test:integration`.
- Modify `.github/workflows/ci.yml`: add an `integration` job with PostgreSQL and Redis services and make build depend on it.

---

### Task 1: Extract A Testable Core Migration Runner

**Files:**
- Modify: `packages/core/src/db/migrate.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/migrate.integration.test.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Write the failing migration integration test**

Create `packages/core/test/migrate.integration.test.ts`:

```ts
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/db/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsDir = join(__dirname, "../src/db/migrations");
const databaseUrl = requiredEnv("DATABASE_URL");

let sql: Sql;

beforeEach(async () => {
  sql = postgres(databaseUrl, { max: 1 });
  await resetPublicSchema(sql);
});

afterAll(async () => {
  await sql?.end();
});

describe("core database migrations", () => {
  it("applies all migrations once and can be re-run safely", async () => {
    await runMigrations({ databaseUrl, migrationsDir, logger: silentLogger });
    await runMigrations({ databaseUrl, migrationsDir, logger: silentLogger });

    const migrationFiles = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const rows = await sql<{ name: string }[]>`
      select name from _migrations order by name
    `;

    expect(rows.map((row) => row.name)).toEqual(migrationFiles);
  });

  it("creates a schema that accepts connected business data", async () => {
    await runMigrations({ databaseUrl, migrationsDir, logger: silentLogger });

    const [product] = await sql<{ id: string }[]>`
      insert into products (title, description, status, source_url)
      values ('Portable desk fan', 'summer item', 'active', 'https://example.test/fan')
      returning id::text as id
    `;
    const [supplier] = await sql<{ id: string }[]>`
      insert into suppliers (name, platform, external_id, reliability_score)
      values ('Yiwu Supplier A', '1688', 'supplier-1', 92)
      returning id::text as id
    `;

    await sql`
      insert into pricing (product_id, cost_cents, list_price_cents, currency)
      values (${product!.id}, 2800, 6900, 'CNY')
    `;
    await sql`
      insert into orders (platform, external_order_id, product_id, quantity, status)
      values ('pdd', 'pdd-order-1', ${product!.id}, 2, 'paid')
    `;
    await sql`
      insert into trends (keyword, platform, score, source, growth_rate, category)
      values ('mini fan', 'douyin', 88, 'integration', 0.32, 'summer')
    `;
    await sql`
      insert into inventory_alerts (product_id, sku_id, alert_type, severity, message, days_remaining, resolved)
      values (${product!.id}, 'sku-1', 'low_stock', 'high', 'Stock below threshold', 2.5, false)
    `;
    await sql`
      insert into supplier_performance (supplier_id, promised_ship_hours, actual_ship_hours, cooperation_count)
      values (${supplier!.id}, 24, 20, 3)
    `;

    const [counts] = await sql<{
      products: string;
      orders: string;
      trends: string;
      inventory_alerts: string;
      suppliers: string;
    }[]>`
      select
        (select count(*)::text from products) as products,
        (select count(*)::text from orders) as orders,
        (select count(*)::text from trends) as trends,
        (select count(*)::text from inventory_alerts) as inventory_alerts,
        (select count(*)::text from suppliers) as suppliers
    `;

    expect(counts).toEqual({
      products: "1",
      orders: "1",
      trends: "1",
      inventory_alerts: "1",
      suppliers: "1"
    });
  });

  it("enforces enum and foreign key constraints", async () => {
    await runMigrations({ databaseUrl, migrationsDir, logger: silentLogger });

    await expect(sql`
      insert into products (title, status)
      values ('Invalid product', 'published')
    `).rejects.toThrow();

    await expect(sql`
      insert into orders (platform, external_order_id, product_id, quantity, status)
      values ('pdd', 'missing-product', gen_random_uuid(), 1, 'paid')
    `).rejects.toThrow();
  });
});

async function resetPublicSchema(db: Sql): Promise<void> {
  await db.unsafe("drop schema if exists public cascade");
  await db.unsafe("create schema public");
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for migration integration tests`);
  }

  return value;
}

const silentLogger = {
  info() {},
  error() {}
};
```

- [ ] **Step 2: Run the test and verify it fails because `runMigrations` is not exported**

Run:

```bash
pnpm --filter @ai-ecommerce/core test -- test/migrate.integration.test.ts
```

Expected: FAIL with an import error for `runMigrations`.

- [ ] **Step 3: Extract `runMigrations` and keep CLI behavior**

Replace `packages/core/src/db/migrate.ts` with:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface MigrationLogger {
  info: (message: string) => void;
  error: (message: string, error?: unknown) => void;
}

export interface RunMigrationsOptions {
  databaseUrl: string;
  migrationsDir?: string;
  logger?: MigrationLogger;
}

const consoleLogger: MigrationLogger = {
  info: (message) => console.log(message),
  error: (message, error) => console.error(message, error)
};

export async function runMigrations({
  databaseUrl,
  migrationsDir = join(__dirname, "migrations"),
  logger = consoleLogger
}: RunMigrationsOptions): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        text        PRIMARY KEY,
        executed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      logger.info("No migration files found.");
      return;
    }

    for (const file of files) {
      const [row] = await sql`
        SELECT name FROM _migrations WHERE name = ${file}
      `;

      if (row) {
        logger.info(`[skip]  ${file} (already executed)`);
        continue;
      }

      const content = readFileSync(join(migrationsDir, file), "utf-8");
      logger.info(`[run]   ${file}`);
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
      logger.info(`[done]  ${file}`);
    }

    logger.info("\nAll migrations applied successfully.");
  } finally {
    await sql.end();
  }
}

async function migrateCli(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  await runMigrations({ databaseUrl });
}

if (process.argv[1] === __filename) {
  migrateCli().catch((err: unknown) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Export the migration runner from core**

Append this line to `packages/core/src/index.ts`:

```ts
export { runMigrations, type RunMigrationsOptions } from "./db/migrate.js";
```

- [ ] **Step 5: Add the core integration script**

Update `packages/core/package.json` scripts:

```json
"test:integration": "vitest run test/**/*.integration.test.ts"
```

- [ ] **Step 6: Run migration integration tests**

Run with a local PostgreSQL URL:

```bash
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/ai_ecommerce_test"; pnpm --filter @ai-ecommerce/core test:integration
```

Expected: PASS when PostgreSQL is available. If PostgreSQL is not running locally, run this task inside CI service context or start a local Postgres container first.

- [ ] **Step 7: Run core build and unit tests**

Run:

```bash
pnpm --filter @ai-ecommerce/core build
pnpm --filter @ai-ecommerce/core test
```

Expected: both commands pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/db/migrate.ts packages/core/src/index.ts packages/core/test/migrate.integration.test.ts packages/core/package.json
git commit -m "test: cover core migrations against postgres"
```

---

### Task 2: Add Server Database-Backed Business API Integration Tests

**Files:**
- Create: `packages/server/test/helpers/database.ts`
- Create: `packages/server/test/business-api.integration.test.ts`
- Modify: `packages/server/package.json`

- [ ] **Step 1: Write the database helper**

Create `packages/server/test/helpers/database.ts`:

```ts
import postgres, { type Sql } from "postgres";
import { runMigrations } from "@ai-ecommerce/core";

export interface SeededBusinessData {
  activeProductId: string;
  archivedProductId: string;
  supplierId: string;
}

export function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for server integration tests`);
  }

  return value;
}

export function createTestSql(databaseUrl = requiredEnv("DATABASE_URL")): Sql {
  return postgres(databaseUrl, { max: 5 });
}

export async function resetAndMigrateDatabase(sql: Sql): Promise<void> {
  await sql.unsafe("drop schema if exists public cascade");
  await sql.unsafe("create schema public");
  await runMigrations({
    databaseUrl: requiredEnv("DATABASE_URL"),
    logger: {
      info() {},
      error() {}
    }
  });
}

export async function seedBusinessData(sql: Sql): Promise<SeededBusinessData> {
  const [activeProduct] = await sql<{ id: string }[]>`
    insert into products (title, description, status, source_url, updated_at)
    values ('Portable desk fan', 'summer cooling', 'active', 'https://example.test/fan', '2026-07-12T00:00:00Z')
    returning id::text as id
  `;
  const [archivedProduct] = await sql<{ id: string }[]>`
    insert into products (title, description, status, source_url, updated_at)
    values ('Dorm storage box', 'back to school', 'archived', 'https://example.test/storage', '2026-07-11T00:00:00Z')
    returning id::text as id
  `;
  const [supplier] = await sql<{ id: string }[]>`
    insert into suppliers (name, platform, external_id, reliability_score)
    values ('Yiwu Supplier A', '1688', 'supplier-1', 92)
    returning id::text as id
  `;

  await sql`
    insert into pricing (product_id, cost_cents, list_price_cents, currency)
    values
      (${activeProduct!.id}, 2800, 6900, 'CNY'),
      (${archivedProduct!.id}, 1400, 3900, 'CNY')
  `;
  await sql`
    insert into orders (platform, external_order_id, product_id, quantity, status, created_at)
    values
      ('pdd', 'pdd-order-1', ${activeProduct!.id}, 2, 'paid', now()),
      ('taobao', 'taobao-order-1', ${archivedProduct!.id}, 1, 'fulfilled', now())
  `;
  await sql`
    insert into trends (keyword, platform, score, source, growth_rate, category)
    values ('mini fan', 'douyin', 88, 'integration', 0.32, 'summer')
  `;
  await sql`
    insert into inventory_alerts (product_id, sku_id, alert_type, severity, message, days_remaining, resolved)
    values (${activeProduct!.id}, 'sku-1', 'low_stock', 'high', 'Stock below threshold', 2.5, false)
  `;
  await sql`
    insert into supplier_performance (supplier_id, promised_ship_hours, actual_ship_hours, cooperation_count, cooperation_amount_cents)
    values (${supplier!.id}, 24, 20, 3, 120000)
  `;
  await sql`
    insert into supplier_alternatives (product_id, supplier_id, priority, active, switch_reason)
    values (${activeProduct!.id}, ${supplier!.id}, 1, true, 'integration seed')
  `;
  await sql`
    insert into review_insights (product_id, platform, sentiment, keywords, issue_category, score)
    values (${activeProduct!.id}, 'pdd', 'positive', '["quiet", "portable"]'::jsonb, 'quality', 0.9)
  `;

  return {
    activeProductId: activeProduct!.id,
    archivedProductId: archivedProduct!.id,
    supplierId: supplier!.id
  };
}
```

- [ ] **Step 2: Write the failing server integration test**

Create `packages/server/test/business-api.integration.test.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";
import {
  createTestSql,
  resetAndMigrateDatabase,
  requiredEnv,
  seedBusinessData
} from "./helpers/database.js";

const originalApiKey = process.env.API_KEY;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

let sql: Sql;
let app: FastifyInstance;

beforeEach(async () => {
  process.env.API_KEY = "integration-secret";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.DATABASE_URL = requiredEnv("DATABASE_URL");
  sql = createTestSql();
  await resetAndMigrateDatabase(sql);
  await seedBusinessData(sql);
  app = await createServer();
});

afterEach(async () => {
  await app?.close();
  await sql?.end();
  restoreEnv();
});

afterAll(() => {
  restoreEnv();
});

describe("business API database integration", () => {
  it("reports database-backed health for migrated and seeded tables", async () => {
    const response = await authorizedGet("/api/diagnostics/data-health");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "database",
      database: {
        configured: true,
        connected: true,
        status: "ok"
      }
    });
    expect(response.json().summary.missingTables).toBe(0);
  });

  it("returns dashboard metrics from seeded orders and pricing", async () => {
    const response = await authorizedGet("/api/dashboard");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "database",
      metrics: {
        todayOrders: { value: 2 },
        todaySales: { value: 17700 },
        activeProducts: { value: 2 },
        profit: { value: 2500 }
      }
    });
    expect(response.json().pendingOrders).toHaveLength(1);
    expect(response.json().inventoryAlerts[0]).toMatchObject({
      title: "Portable desk fan",
      status: "paused"
    });
  });

  it("returns seeded products through the public product shape", async () => {
    const response = await authorizedGet("/api/products");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "database",
      products: expect.arrayContaining([
        expect.objectContaining({
          title: "Portable desk fan",
          platform: "douyin",
          price: 69,
          cost: 28,
          status: "active"
        }),
        expect.objectContaining({
          title: "Dorm storage box",
          status: "paused"
        })
      ])
    });
  });

  it("returns seeded orders through the public order shape", async () => {
    const response = await authorizedGet("/api/orders");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "database",
      orders: expect.arrayContaining([
        expect.objectContaining({
          platform: "pdd",
          buyer: "pdd-order-1",
          productTitle: "Portable desk fan",
          amount: 138,
          profit: 82,
          status: "purchasing"
        }),
        expect.objectContaining({
          platform: "taobao",
          buyer: "taobao-order-1",
          productTitle: "Dorm storage box",
          amount: 39,
          profit: 25,
          status: "completed"
        })
      ])
    });
  });

  it("returns sourcing and analytics from seeded database state", async () => {
    const sourcing = await authorizedGet("/api/sourcing");
    const analytics = await authorizedGet("/api/analytics");

    expect(sourcing.statusCode).toBe(200);
    expect(sourcing.json()).toMatchObject({
      sourceType: "database",
      keywords: [
        expect.objectContaining({
          keyword: "mini fan",
          searchVolume: 88000,
          growth: 0.32
        })
      ]
    });

    expect(analytics.statusCode).toBe(200);
    expect(analytics.json()).toMatchObject({
      sourceType: "database",
      productRanking: expect.arrayContaining([
        expect.objectContaining({
          title: "Portable desk fan",
          sales: 2,
          revenue: 13800
        })
      ]),
      platformShare: expect.arrayContaining([
        expect.objectContaining({ platform: "pdd", value: 1 }),
        expect.objectContaining({ platform: "taobao", value: 1 })
      ])
    });
  });
});

async function authorizedGet(url: string) {
  return app.inject({
    method: "GET",
    url,
    headers: {
      authorization: "Bearer integration-secret"
    }
  });
}

function restoreEnv(): void {
  setEnv("API_KEY", originalApiKey);
  setEnv("DATABASE_URL", originalDatabaseUrl);
  setEnv("NODE_ENV", originalNodeEnv);
  setEnv("LOG_LEVEL", originalLogLevel);
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
```

- [ ] **Step 3: Run the test and verify it fails for missing helper/export wiring if Task 1 is incomplete**

Run:

```bash
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/ai_ecommerce_test"; pnpm --filter @ai-ecommerce/server test -- test/business-api.integration.test.ts
```

Expected after Task 1 is complete and PostgreSQL is running: PASS. If it fails, the failure should point to a real SQL/API mismatch; fix the seed or public API assertion to match intended behavior, not mock fallback.

- [ ] **Step 4: Add the server integration script**

Update `packages/server/package.json` scripts:

```json
"test:integration": "vitest run test/**/*.integration.test.ts"
```

- [ ] **Step 5: Run server unit and integration tests**

Run:

```bash
pnpm --filter @ai-ecommerce/core build
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/ai_ecommerce_test"; pnpm --filter @ai-ecommerce/server test:integration
pnpm --filter @ai-ecommerce/server test
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/test/helpers/database.ts packages/server/test/business-api.integration.test.ts packages/server/package.json
git commit -m "test: cover server business APIs with postgres"
```

---

### Task 3: Add PDD Client Contract Tests

**Files:**
- Create: `packages/platforms/pdd/test/client-contract.test.ts`

- [ ] **Step 1: Write the PDD contract tests**

Create `packages/platforms/pdd/test/client-contract.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { PddError } from "../src/errors.js";
import { PddClient } from "../src/client.js";
import type { FetchLike } from "../src/token-manager.js";

describe("PddClient contract", () => {
  it("sends signed JSON requests and parses goods list responses", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json({
        pdd_goods_list_get_response: {
          total: 1,
          items: [
            {
              goodsId: "goods-1",
              goodsName: "Portable desk fan",
              price: 69,
              quantity: 12,
              isOnsale: true
            }
          ]
        }
      })
    );
    const client = createClient(fetchFn);

    const result = await client.getGoodsList({ page: 1, pageSize: 20 });

    expect(result).toEqual({
      total: 1,
      items: [
        {
          goodsId: "goods-1",
          goodsName: "Portable desk fan",
          price: 69,
          quantity: 12,
          isOnsale: true
        }
      ]
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://example.test/pdd");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      access_token: "access-token",
      client_id: "client-id",
      data_type: "JSON",
      sign_method: "md5",
      type: "pdd.goods.list.get",
      page: 1,
      pageSize: 20
    });
    expect(body.sign).toEqual(expect.any(String));
  });

  it("maps PDD error envelopes to PddError", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json(
        {
          error_response: {
            error_code: 10019,
            error_msg: "invalid access token"
          }
        },
        { status: 200 }
      )
    );
    const client = createClient(fetchFn);

    await expect(client.getGoodsList({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      name: "PddError",
      errorCode: "10019",
      message: "invalid access token"
    } satisfies Partial<PddError>);
  });

  it("retries retryable HTTP failures and stops after success", async () => {
    const fetchFn = vi.fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({
        pdd_order_list_get_response: {
          total: 0,
          items: []
        }
      }));
    const client = createClient(fetchFn);

    const result = await client.getOrderList({
      startUpdatedAt: "2026-07-12 00:00:00",
      endUpdatedAt: "2026-07-12 23:59:59",
      page: 1,
      pageSize: 10
    });

    expect(result).toEqual({ total: 0, items: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

function createClient(fetchFn: FetchLike): PddClient {
  return new PddClient(
    {
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "access-token",
      apiBaseUrl: "https://example.test/pdd",
      requestsPerSecond: 100
    },
    { fetchFn }
  );
}
```

- [ ] **Step 2: Run PDD tests**

Run:

```bash
pnpm --filter @ai-ecommerce/platform-pdd test -- test/client-contract.test.ts
```

Expected: PASS. If the error assertion fails because `PddError` exposes a different public field, adjust the assertion to the actual class contract and keep checking the marketplace error code and message.

- [ ] **Step 3: Run all PDD package tests**

Run:

```bash
pnpm --filter @ai-ecommerce/platform-pdd test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/platforms/pdd/test/client-contract.test.ts
git commit -m "test: add pdd client contract coverage"
```

---

### Task 4: Add Alibaba 1688 Client Contract Tests

**Files:**
- Create: `packages/platforms/alibaba1688/test/client-contract.test.ts`

- [ ] **Step 1: Write the Alibaba 1688 contract tests**

Create `packages/platforms/alibaba1688/test/client-contract.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { Alibaba1688Client } from "../src/client.js";
import { Alibaba1688Error } from "../src/errors.js";
import type { FetchLike } from "../src/token-manager.js";

describe("Alibaba1688Client contract", () => {
  it("sends signed form requests and parses search responses", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json({
        success: true,
        result: {
          total: 1,
          items: [
            {
              id: "source-1",
              title: "Portable desk fan",
              priceRange: { min: 28, max: 32 },
              moq: 2,
              image: "https://example.test/fan.jpg",
              sellerId: "seller-1"
            }
          ]
        }
      })
    );
    const client = createClient(fetchFn);

    const result = await client.searchProducts({
      keyword: "fan",
      page: 1,
      pageSize: 20
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: "source-1",
      title: "Portable desk fan",
      sellerId: "seller-1"
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://example.test/1688");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/x-www-form-urlencoded"
    });
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("access_token")).toBe("access-token");
    expect(body.get("app_key")).toBe("app-key");
    expect(body.get("method")).toBe("com.alibaba.product.search");
    expect(body.get("keyword")).toBe("fan");
    expect(body.get("page")).toBe("1");
    expect(body.get("pageSize")).toBe("20");
    expect(body.get("sign")).toEqual(expect.any(String));
  });

  it("maps Alibaba error envelopes to Alibaba1688Error", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json({
        success: false,
        errorCode: "InvalidToken",
        errorMessage: "invalid access token"
      })
    );
    const client = createClient(fetchFn);

    await expect(
      client.searchProducts({ keyword: "fan", page: 1, pageSize: 20 })
    ).rejects.toMatchObject({
      name: "Alibaba1688Error",
      errorCode: "InvalidToken",
      message: "invalid access token"
    } satisfies Partial<Alibaba1688Error>);
  });

  it("retries retryable HTTP failures and returns the successful response", async () => {
    const fetchFn = vi.fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: {
          orderId: "purchase-1",
          status: "created"
        }
      }));
    const client = createClient(fetchFn);

    const result = await client.createOrder({
      productId: "source-1",
      quantity: 2,
      skuSpec: "white",
      receiverName: "Chen",
      receiverPhone: "13800000000",
      receiverAddress: "Shanghai Pudong Sample Road 88",
      idempotencyKey: "order-1-source-1"
    });

    expect(result).toEqual({
      orderId: "purchase-1",
      status: "created"
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

function createClient(fetchFn: FetchLike): Alibaba1688Client {
  return new Alibaba1688Client(
    {
      appKey: "app-key",
      appSecret: "app-secret",
      accessToken: "access-token",
      apiBaseUrl: "https://example.test/1688",
      requestsPerMinute: 100
    },
    { fetchFn }
  );
}
```

- [ ] **Step 2: Run Alibaba 1688 tests**

Run:

```bash
pnpm --filter @ai-ecommerce/platform-alibaba1688 test -- test/client-contract.test.ts
```

Expected: PASS. If the error assertion fails because `Alibaba1688Error` exposes a different public field, adjust the assertion to the actual class contract and keep checking the marketplace error code and message.

- [ ] **Step 3: Run all Alibaba 1688 package tests**

Run:

```bash
pnpm --filter @ai-ecommerce/platform-alibaba1688 test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/platforms/alibaba1688/test/client-contract.test.ts
git commit -m "test: add alibaba client contract coverage"
```

---

### Task 5: Complete The Web API Client Error Contract

**Files:**
- Modify: `packages/web/src/api/client.test.ts`

- [ ] **Step 1: Add failing tests for local storage token and non-2xx responses**

Append these tests inside the existing `describe("API client authentication", ...)` block in `packages/web/src/api/client.test.ts`:

```ts
  it("uses a token persisted in local storage", async () => {
    window.localStorage.setItem("ai-ecommerce.apiToken", "stored-secret");
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await getJson("/api/products");

    expect(fetchMock).toHaveBeenCalledWith("/api/products", {
      headers: {
        Authorization: "Bearer stored-secret"
      }
    });
  });

  it("throws ApiRequestError with status and response body for non-2xx responses", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(getJson("/api/dashboard")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 401,
      body: { error: "Unauthorized" }
    });
  });
```

Update the import at the top:

```ts
import { ApiRequestError, clearApiToken, getJson, setApiToken } from "./client";
```

Add this assertion at the end of the non-2xx test:

```ts
    await expect(getJson("/api/dashboard")).rejects.toBeInstanceOf(ApiRequestError);
```

- [ ] **Step 2: Run web API tests and observe the local storage test failure if jsdom is not configured**

Run:

```bash
pnpm --filter @ai-ecommerce/web test -- src/api/client.test.ts
```

Expected before configuration fix: FAIL if Vitest is using Node without `window`.

- [ ] **Step 3: Keep the test environment compatible without adding browser E2E**

If the test fails because `window` is missing, add `packages/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom"
  }
});
```

Add `jsdom` to `packages/web/package.json` devDependencies:

```json
"jsdom": "^26.0.0"
```

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates with `jsdom`.

- [ ] **Step 4: Run web API tests**

Run:

```bash
pnpm --filter @ai-ecommerce/web test -- src/api/client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/client.test.ts packages/web/vitest.config.ts packages/web/package.json pnpm-lock.yaml
git commit -m "test: cover web api client error contract"
```

If `packages/web/vitest.config.ts`, `packages/web/package.json`, or `pnpm-lock.yaml` did not change because the existing environment already supports `window`, leave those paths out of `git add`.

---

### Task 6: Add Root Integration Script And CI Gate

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add root integration script**

Modify root `package.json` scripts:

```json
"test:integration": "pnpm --filter @ai-ecommerce/core --filter @ai-ecommerce/server test:integration && pnpm --filter @ai-ecommerce/platform-pdd --filter @ai-ecommerce/platform-alibaba1688 test"
```

For PowerShell compatibility when running locally, use the command parts separately if `&&` is not supported:

```powershell
pnpm --filter @ai-ecommerce/core --filter @ai-ecommerce/server test:integration
pnpm --filter @ai-ecommerce/platform-pdd --filter @ai-ecommerce/platform-alibaba1688 test
```

- [ ] **Step 2: Add CI integration job**

In `.github/workflows/ci.yml`, add this job after the existing `test` job:

```yaml
  integration:
    name: Integration
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ai_ecommerce_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d ai_ecommerce_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/ai_ecommerce_test
      REDIS_URL: redis://localhost:6379
      API_KEY: integration-secret
      NODE_ENV: test
      LOG_LEVEL: silent
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: 22
          package-manager-cache: false

      - name: Setup pnpm
        run: |
          npm install -g pnpm@9.15.0
          pnpm --version

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build shared deps
        run: pnpm --filter @ai-ecommerce/core --filter @ai-ecommerce/platform-alibaba1688 build

      - name: Run integration tests
        run: pnpm test:integration

      - name: Notify failure
        if: failure() && env.FEISHU_WEBHOOK_URL != ''
        run: node scripts/notify-feishu.mjs "CI integration failed" "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
```

- [ ] **Step 3: Make build depend on integration**

Change the build job dependency from:

```yaml
    needs: [lint, typecheck, test]
```

to:

```yaml
    needs: [lint, typecheck, test, integration]
```

- [ ] **Step 4: Validate workflow syntax through local review**

Run:

```bash
pnpm exec prettier --check .github/workflows/ci.yml package.json
```

Expected: PASS after formatting. If Prettier reports formatting differences, run:

```bash
pnpm exec prettier --write .github/workflows/ci.yml package.json
```

- [ ] **Step 5: Run the new root script locally or in CI services**

Run:

```bash
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/ai_ecommerce_test"; $env:REDIS_URL="redis://localhost:6379"; $env:API_KEY="integration-secret"; $env:NODE_ENV="test"; $env:LOG_LEVEL="silent"; pnpm test:integration
```

Expected: PASS when PostgreSQL and Redis are available.

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "ci: add business integration test gate"
```

---

### Task 7: Final Verification And Cleanup

**Files:**
- Review all files changed in Tasks 1-6.

- [ ] **Step 1: Run format check**

Run:

```bash
pnpm exec prettier --check .
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run unit tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Run integration tests**

Run with PostgreSQL and Redis available:

```bash
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/ai_ecommerce_test"; $env:REDIS_URL="redis://localhost:6379"; $env:API_KEY="integration-secret"; $env:NODE_ENV="test"; $env:LOG_LEVEL="silent"; pnpm test:integration
```

Expected: PASS.

- [ ] **Step 7: Inspect git diff for unrelated changes**

Run:

```bash
git status --short
git diff --stat
```

Expected: only files from this plan are changed, plus pre-existing user changes that were already present before execution.

- [ ] **Step 8: Commit any final formatting-only changes**

If formatting changed files after previous task commits, commit only those formatting changes:

```powershell
git add packages/core/src/db/migrate.ts packages/core/src/index.ts packages/core/package.json packages/core/test/migrate.integration.test.ts
git add packages/server/package.json packages/server/test/helpers/database.ts packages/server/test/business-api.integration.test.ts
git add packages/platforms/pdd/test/client-contract.test.ts packages/platforms/alibaba1688/test/client-contract.test.ts
git add packages/web/src/api/client.test.ts package.json .github/workflows/ci.yml pnpm-lock.yaml
if (Test-Path packages/web/vitest.config.ts) { git add packages/web/vitest.config.ts }
git commit -m "chore: format integration test changes"
```

For a Linux shell, use:

```bash
git add packages/core/src/db/migrate.ts packages/core/src/index.ts packages/core/package.json packages/core/test/migrate.integration.test.ts
git add packages/server/package.json packages/server/test/helpers/database.ts packages/server/test/business-api.integration.test.ts
git add packages/platforms/pdd/test/client-contract.test.ts packages/platforms/alibaba1688/test/client-contract.test.ts
git add packages/web/src/api/client.test.ts package.json .github/workflows/ci.yml pnpm-lock.yaml
test ! -f packages/web/vitest.config.ts || git add packages/web/vitest.config.ts
git commit -m "chore: format integration test changes"
```

If no files changed, skip this commit.

---

## Self-Review

Spec coverage:
- Platform client contract tests are covered by Tasks 3 and 4.
- Core migration integration tests are covered by Task 1.
- Server database-backed business API integration tests are covered by Task 2.
- Web API client authentication and error contract are covered by Task 5.
- CI integration gate with PostgreSQL and Redis services is covered by Task 6.
- Verification is covered by Task 7.

Scope check:
- Phase 1 intentionally excludes Playwright E2E, Docker Compose smoke tests, live marketplace calls, destructive migration compatibility analysis, and exhaustive package coverage.
- The plan keeps mocked marketplace boundaries and real database/service boundaries, matching the approved design.

Type consistency:
- `runMigrations` is exported from `packages/core/src/db/migrate.ts` and re-exported from `packages/core/src/index.ts`.
- Server helpers import `runMigrations` from `@ai-ecommerce/core`.
- All server integration requests use `Authorization: Bearer integration-secret`.
- Integration scripts use `test:integration` consistently at package and root levels.
