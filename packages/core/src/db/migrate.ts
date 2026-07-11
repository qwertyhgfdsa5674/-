import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// ── Path utilities (ESM-compatible __dirname) ─────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Runner ─────────────────────────────────────────────────────────────

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  // Single-connection pool — migrations should never run in parallel
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // Ensure the bookkeeping table exists before processing migrations
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        text        PRIMARY KEY,
        executed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = join(__dirname, "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // run in lexicographic order (0000_, 0001_, …)

    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const file of files) {
      // Check if already executed
      const [row] = await sql`
        SELECT name FROM _migrations WHERE name = ${file}
      `;

      if (row) {
        console.log(`[skip]  ${file} (already executed)`);
        continue;
      }

      const content = readFileSync(join(migrationsDir, file), "utf-8");
      console.log(`[run]   ${file}`);
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
      console.log(`[done]  ${file}`);
    }

    console.log("\nAll migrations applied successfully.");
  } finally {
    await sql.end();
  }
}

migrate().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
