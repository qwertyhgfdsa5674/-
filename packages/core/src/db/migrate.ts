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
  error: (message, error) => console.error(message, error),
};

export async function runMigrations({
  databaseUrl,
  migrationsDir = join(__dirname, "migrations"),
  logger = consoleLogger,
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
