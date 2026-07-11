import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";

const originalApiKey = process.env["API_KEY"];
const originalDatabaseUrl = process.env["DATABASE_URL"];

afterEach(() => {
  setEnv("API_KEY", originalApiKey);
  setEnv("DATABASE_URL", originalDatabaseUrl);
});

describe("API hardening and diagnostics", () => {
  it("keeps GET endpoints public and falls back to mock data without a database", async () => {
    delete process.env["API_KEY"];
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sourceType: "mock",
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

  it("reports an unconfigured database instead of a generic loading failure", async () => {
    delete process.env["DATABASE_URL"];
    const app = await createServer(testConfig());

    const response = await app.inject({
      method: "GET",
      url: "/api/diagnostics/data-health",
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
