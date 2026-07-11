import { createServer } from "./index.js";
import { DEFAULT_HOST, DEFAULT_PORT } from "./constants.js";

const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
const host = process.env["HOST"] ?? DEFAULT_HOST;
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
