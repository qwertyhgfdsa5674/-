import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_REDIS_URL,
} from "./constants.js";

export interface AppConfig {
  port: number;
  host: string;
  redisUrl: string;
  logLevel: string;
  rateLimit: {
    max: number;
    timeWindow: string;
  };
}

export function loadConfig(): AppConfig {
  const env = process.env["NODE_ENV"] ?? "development";

  return {
    port: Number(process.env["PORT"] ?? DEFAULT_PORT),
    host: process.env["HOST"] ?? DEFAULT_HOST,
    redisUrl: process.env["REDIS_URL"] ?? DEFAULT_REDIS_URL,
    logLevel: process.env["LOG_LEVEL"] ?? (env === "production" ? "info" : "debug"),
    rateLimit: {
      max: Number(process.env["RATE_LIMIT_MAX"] ?? (env === "production" ? 60 : 500)),
      timeWindow: "1 minute",
    },
  };
}
