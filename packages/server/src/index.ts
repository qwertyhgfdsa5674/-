import Fastify from "fastify";
import { Queue } from "bullmq";
import { createIdempotencyKey } from "@ai-ecommerce/core";

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    ok: true,
    service: "ai-ecommerce-server"
  }));

  return app;
}

export function createDefaultQueue(redisUrl = "redis://localhost:6379") {
  return new Queue("ai-ecommerce-jobs", {
    connection: {
      url: redisUrl
    }
  });
}

export { createIdempotencyKey };
