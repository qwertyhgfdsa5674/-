import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

afterEach(async () => {
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

    const [counts] = await sql<
      {
        products: string;
        orders: string;
        trends: string;
        inventory_alerts: string;
        suppliers: string;
      }[]
    >`
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
      suppliers: "1",
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
  await db.unsafe("create extension if not exists pgcrypto");
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
  error() {},
};
