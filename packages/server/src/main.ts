import { createServer } from "./index.js";

const port = Number(process.env["PORT"] ?? "3000");
const host = process.env["HOST"] ?? "0.0.0.0";
const app = await createServer();

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
