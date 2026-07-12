import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";

const originalApiKey = process.env["API_KEY"];
const originalDatabaseUrl = process.env["DATABASE_URL"];
const originalNodeEnv = process.env["NODE_ENV"];

afterEach(() => {
  setEnv("API_KEY", originalApiKey);
  setEnv("DATABASE_URL", originalDatabaseUrl);
  setEnv("NODE_ENV", originalNodeEnv);
});

describe("API hardening and diagnostics", () => {
  it("requires API_KEY in production", async () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["API_KEY"];

    await expect(createServer(testConfig())).rejects.toThrow(
      "API_KEY is required in production"
    );
  });

  it("keeps health checks public when API_KEY is configured", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("keeps liveness separate from dependency readiness", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    let redisPingCalls = 0;
    const app = await createServer(testConfig(), {
      redis: {
        async ping() {
          redisPingCalls += 1;
          throw new Error("redis unavailable");
        },
        disconnect() {}
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/health/live"
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      checks: {
        http: "ok"
      }
    });
    expect(redisPingCalls).toBe(0);
  });

  it("returns readiness success only when database and Redis are reachable", async () => {
    process.env["API_KEY"] = "secret";
    const app = await createServer(testConfig(), {
      sql: healthySql(),
      redis: healthyRedis()
    });

    const response = await app.inject({
      method: "GET",
      url: "/health/ready"
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      checks: {
        database: {
          configured: true,
          status: "ok"
        },
        redis: {
          configured: true,
          status: "ok"
        }
      }
    });
  });

  it("returns readiness failure when database is not configured", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig(), {
      redis: healthyRedis()
    });

    const response = await app.inject({
      method: "GET",
      url: "/health/ready"
    });

    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      ok: false,
      checks: {
        database: {
          configured: false,
          status: "unconfigured"
        },
        redis: {
          configured: true,
          status: "ok"
        }
      }
    });
  });

  it("returns readiness failure when Redis ping fails", async () => {
    process.env["API_KEY"] = "secret";
    const app = await createServer(testConfig(), {
      sql: healthySql(),
      redis: {
        async ping() {
          throw new Error("redis unavailable");
        },
        disconnect() {}
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/health/ready"
    });

    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      ok: false,
      checks: {
        database: {
          configured: true,
          status: "ok"
        },
        redis: {
          configured: true,
          status: "error",
          error: "redis unavailable"
        }
      }
    });
  });

  it("rejects GET API requests when API_KEY is configured and bearer token is missing", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects protected API requests when API_KEY is not configured", async () => {
    delete process.env["API_KEY"];
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "API authentication is not configured",
    });
  });

  it("rejects POST requests when API_KEY is configured and bearer token is missing", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "POST",
      url: "/api/pricing/recommend",
      payload: {},
    });

    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });

  it("serves GET API requests when bearer token matches API_KEY", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: {
        authorization: "Bearer secret",
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "mock",
    });
  });

  it("fails closed instead of returning mock data when production has no database", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig(), {
      redis: healthyRedis()
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: {
        authorization: "Bearer secret",
      },
    });

    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Database unavailable" });
  });

  it("fails closed instead of returning mock data when a production query fails", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["API_KEY"] = "secret";
    const app = await createServer(testConfig(), {
      sql: failingSql("database query failed"),
      redis: healthyRedis()
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: {
        authorization: "Bearer secret",
      },
    });

    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Database unavailable" });
  });

  it("protects Swagger docs when API_KEY is configured", async () => {
    process.env["API_KEY"] = "secret";
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/docs",
    });

    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });

  it("reports an unconfigured database instead of a generic loading failure", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/api/diagnostics/data-health",
      headers: {
        authorization: "Bearer secret",
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "mock",
      database: {
        configured: false,
        connected: false,
        status: "unconfigured",
      },
      summary: {
        errorTables: 0,
      },
    });
  });

  it("publishes selected source products through a single listing workflow endpoint", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "POST",
      url: "/api/listings/publish",
      headers: {
        authorization: "Bearer secret"
      },
      payload: {
        sourceProductIds: ["1688-1"],
        targetPlatforms: ["pdd"],
        reviewMode: "auto",
        operatorId: "ops-1"
      }
    });

    await app.close();

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      duplicates: [],
      tasks: [
        {
          sourceProductId: "1688-1",
          platform: "pdd",
          status: "live",
          externalListingId: "pdd-1688-1"
        }
      ],
      metrics: {
        candidatesScanned: 1,
        listingsCreated: 1,
        listingsLive: 1
      }
    });
  });

  it("limits publish attempts by quota across platform fan-out", async () => {
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "POST",
      url: "/api/listings/publish",
      headers: {
        authorization: "Bearer secret"
      },
      payload: {
        sourceProductIds: ["1688-1"],
        targetPlatforms: ["douyin", "pdd", "taobao"],
        reviewMode: "auto",
        operatorId: "ops-1",
        quotaPolicy: {
          maxListings: 1
        }
      }
    });

    await app.close();

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      tasks: [
        {
          platform: "douyin"
        }
      ],
      duplicates: []
    });
  });

  it("fails closed in production when no real listing workflow is injected", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "POST",
      url: "/api/listings/publish",
      headers: {
        authorization: "Bearer secret"
      },
      payload: {
        sourceProductIds: ["1688-1"],
        targetPlatforms: ["pdd"],
        reviewMode: "auto",
        operatorId: "ops-1"
      }
    });

    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "Listing workflow is not configured"
    });
  });

  it("does not report mock diagnostics as the source in production", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["API_KEY"] = "secret";
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig(), {
      redis: healthyRedis()
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/diagnostics/data-health",
      headers: {
        authorization: "Bearer secret",
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "database",
      database: {
        configured: false,
        connected: false,
        status: "unconfigured",
      },
    });
  });
});

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

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function healthyRedis() {
  return {
    async ping() {
      return "PONG";
    },
    disconnect() {}
  };
}

function healthySql() {
  return (async () => [{ ok: 1 }]) as never;
}

function failingSql(message: string) {
  return (async () => {
    throw new Error(message);
  }) as never;
}
