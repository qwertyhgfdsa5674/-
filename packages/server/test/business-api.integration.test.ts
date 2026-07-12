import type { FastifyInstance } from "fastify";
import type { Sql } from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";
import {
  assertTestDatabaseUrl,
  createTestSql,
  requiredEnv,
  resetAndMigrateDatabase,
  seedBusinessData,
} from "./helpers/database.js";

const originalEnv = {
  API_KEY: process.env["API_KEY"],
  DATABASE_URL: process.env["DATABASE_URL"],
  LOG_LEVEL: process.env["LOG_LEVEL"],
  NODE_ENV: process.env["NODE_ENV"],
};

let app: FastifyInstance | undefined;
let sql: Sql | undefined;

describe("database integration test helpers", () => {
  it("rejects unsafe database URLs before resetting schemas", () => {
    expect(() =>
      assertTestDatabaseUrl("postgres://postgres:postgres@localhost:5432/app"),
    ).toThrow("integration tests require a disposable test database URL");
  });
});

describe("business API database integration", () => {
  beforeEach(async () => {
    const databaseUrl = requiredEnv("DATABASE_URL");

    process.env["API_KEY"] = "integration-secret";
    process.env["NODE_ENV"] = "test";
    process.env["LOG_LEVEL"] = "silent";
    process.env["DATABASE_URL"] = databaseUrl;

    sql = createTestSql(databaseUrl);
    await resetAndMigrateDatabase(sql, databaseUrl);
    await seedBusinessData(sql);
    app = await createServer(testConfig());
  });

  afterEach(async () => {
    let closeResults: PromiseSettledResult<unknown>[] = [];

    try {
      closeResults = await Promise.allSettled([app?.close(), sql?.end()]);
    } finally {
      app = undefined;
      sql = undefined;

      restoreEnv("API_KEY", originalEnv.API_KEY);
      restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
      restoreEnv("LOG_LEVEL", originalEnv.LOG_LEVEL);
      restoreEnv("NODE_ENV", originalEnv.NODE_ENV);
    }

    const rejections = closeResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (rejections.length > 0) {
      throw new AggregateError(
        rejections.map((result) => result.reason),
        "Failed to close integration test resources",
      );
    }
  });

  it("reports database-backed data health", async () => {
    const response = await authenticatedGet("/api/diagnostics/data-health");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "database",
      database: {
        connected: true,
        status: "ok",
      },
      summary: {
        missingTables: 0,
      },
    });
  });

  it("returns database-backed dashboard metrics and alerts", async () => {
    const response = await authenticatedGet("/api/dashboard");
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      sourceType: "database",
      metrics: {
        todayOrders: { value: 2 },
        todaySales: { value: 17700 },
        activeProducts: { value: 2 },
        profit: { value: 2500 },
      },
    });
    expect(body.pendingOrders).toHaveLength(1);
    expect(body.inventoryAlerts).toEqual([
      expect.objectContaining({
        title: "Portable desk fan",
        status: "paused",
      }),
    ]);
  });

  it("returns database-backed products with mapped statuses and prices", async () => {
    const response = await authenticatedGet("/api/products");
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.sourceType).toBe("database");
    expect(body.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Portable desk fan",
          status: "active",
          price: 69,
          cost: 28,
        }),
        expect.objectContaining({
          title: "Dorm storage box",
          status: "paused",
        }),
      ]),
    );
  });

  it("returns database-backed orders with mapped statuses and profit", async () => {
    const response = await authenticatedGet("/api/orders");
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.sourceType).toBe("database");
    expect(body.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buyer: "pdd-order-1",
          amount: 138,
          profit: 82,
          status: "purchasing",
        }),
        expect.objectContaining({
          buyer: "taobao-order-1",
          amount: 39,
          profit: 25,
          status: "completed",
        }),
      ]),
    );
  });

  it("returns database-backed sourcing trends and analytics", async () => {
    const sourcingResponse = await authenticatedGet("/api/sourcing");
    const sourcing = sourcingResponse.json();
    const analyticsResponse = await authenticatedGet("/api/analytics");
    const analytics = analyticsResponse.json();

    expect(sourcingResponse.statusCode).toBe(200);
    expect(sourcing.sourceType).toBe("database");
    expect(sourcing.keywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "mini fan",
          searchVolume: 88000,
          growth: expect.closeTo(0.32, 5),
        }),
      ]),
    );

    expect(analyticsResponse.statusCode).toBe(200);
    expect(analytics.sourceType).toBe("database");
    expect(analytics.productRanking).toEqual(
      expect.arrayContaining([
        {
          title: "Portable desk fan",
          sales: 2,
          revenue: 13800,
        },
      ]),
    );
    expect(analytics.platformShare).toEqual(
      expect.arrayContaining([
        { platform: "pdd", value: 1 },
        { platform: "taobao", value: 1 },
      ]),
    );
  });
});

function authenticatedGet(url: string) {
  return app!.inject({
    method: "GET",
    url,
    headers: {
      authorization: "Bearer integration-secret",
    },
  });
}

function testConfig() {
  return {
    port: 0,
    host: "127.0.0.1",
    redisUrl: "redis://localhost:6379",
    logLevel: "silent",
    rateLimit: {
      max: 1000,
      timeWindow: "1 minute",
    },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
