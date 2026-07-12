import { runMigrations } from "@ai-ecommerce/core";
import postgres, { type Sql } from "postgres";

export function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for server integration tests`);
  }

  return value;
}

export function assertTestDatabaseUrl(databaseUrl: string): void {
  let databaseName: string;

  try {
    const url = new URL(databaseUrl);
    databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error(
      "Server integration tests require a disposable test database URL.",
    );
  }

  if (
    databaseName === "ai_ecommerce_test" ||
    /(_test|test_)/i.test(databaseName)
  ) {
    return;
  }

  throw new Error(
    "Server integration tests require a disposable test database URL.",
  );
}

export function createTestSql(
  databaseUrl = requiredEnv("DATABASE_URL"),
): Sql<Record<string, never>> {
  return postgres(databaseUrl, { max: 1 });
}

export async function resetAndMigrateDatabase(
  sql: Sql,
  databaseUrl = requiredEnv("DATABASE_URL"),
): Promise<void> {
  assertTestDatabaseUrl(databaseUrl);

  await sql.unsafe("drop schema if exists public cascade");
  await sql.unsafe("create schema public");
  await sql.unsafe("create extension if not exists pgcrypto");

  await runMigrations({
    databaseUrl,
    logger: silentLogger,
  });
}

export async function seedBusinessData(sql: Sql): Promise<void> {
  const [activeProduct] = await sql<{ id: string }[]>`
    insert into products (title, description, status, source_url, updated_at)
    values (
      'Portable desk fan',
      'summer cooling',
      'active',
      'https://example.test/fan',
      now()
    )
    returning id::text as id
  `;
  const [archivedProduct] = await sql<{ id: string }[]>`
    insert into products (title, description, status, source_url, updated_at)
    values (
      'Dorm storage box',
      'dorm storage',
      'archived',
      'https://example.test/storage-box',
      now() - interval '1 minute'
    )
    returning id::text as id
  `;
  const [supplier] = await sql<{ id: string }[]>`
    insert into suppliers (name, platform, external_id, reliability_score)
    values ('Yiwu Supplier A', '1688', 'supplier-1', 92)
    returning id::text as id
  `;

  await sql`
    insert into pricing (product_id, cost_cents, list_price_cents, currency)
    values
      (${activeProduct!.id}, 2800, 6900, 'CNY'),
      (${archivedProduct!.id}, 1400, 3900, 'CNY')
  `;
  await sql`
    insert into orders (
      platform,
      external_order_id,
      product_id,
      quantity,
      status,
      created_at
    )
    values
      ('pdd', 'pdd-order-1', ${activeProduct!.id}, 2, 'paid', now()),
      ('taobao', 'taobao-order-1', ${archivedProduct!.id}, 1, 'fulfilled', now())
  `;
  await sql`
    insert into trends (keyword, platform, score, source, growth_rate, category)
    values ('mini fan', 'douyin', 88, 'integration', 0.32, 'summer')
  `;
  await sql`
    insert into inventory_alerts (
      product_id,
      sku_id,
      alert_type,
      severity,
      message,
      days_remaining,
      resolved
    )
    values (
      ${activeProduct!.id},
      'sku-fan-1',
      'low_stock',
      'high',
      'Portable desk fan inventory low',
      2.5,
      false
    )
  `;
  await sql`
    insert into supplier_performance (
      supplier_id,
      promised_ship_hours,
      actual_ship_hours,
      return_rate,
      response_hours,
      cooperation_count,
      cooperation_amount_cents
    )
    values (${supplier!.id}, 24, 20, 0.02, 1.5, 3, 15800)
  `;
  await sql`
    insert into supplier_alternatives (
      product_id,
      supplier_id,
      priority,
      active,
      switch_reason
    )
    values (${activeProduct!.id}, ${supplier!.id}, 1, true, 'integration backup')
  `;
  await sql`
    insert into review_insights (
      product_id,
      platform,
      sentiment,
      keywords,
      issue_category,
      score
    )
    values (
      ${activeProduct!.id},
      'pdd',
      'positive',
      ${sql.json(["quiet", "portable"])},
      'quality',
      0.91
    )
  `;
}

const silentLogger = {
  info() {},
  error() {},
};
