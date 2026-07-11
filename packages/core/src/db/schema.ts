import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "archived"
]);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded"
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 240 }).notNull(),
  description: varchar("description", { length: 2000 }),
  status: productStatus("status").notNull().default("draft"),
  sourceUrl: varchar("source_url", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 180 }).notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  externalId: varchar("external_id", { length: 180 }),
  reliabilityScore: integer("reliability_score").notNull().default(0)
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: varchar("platform", { length: 32 }).notNull(),
  externalOrderId: varchar("external_order_id", { length: 180 }).notNull(),
  productId: uuid("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  status: orderStatus("status").notNull().default("pending")
});

export const pricing = pgTable("pricing", {
  productId: uuid("product_id").primaryKey(),
  costCents: integer("cost_cents").notNull(),
  listPriceCents: integer("list_price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("CNY")
});

export const trends = pgTable(
  "trends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyword: varchar("keyword", { length: 200 }).notNull(),
    platform: varchar("platform", { length: 32 }).notNull(),
    score: integer("score").notNull().default(0),
    source: varchar("source", { length: 64 }).notNull().default("mock"),
    growthRate: real("growth_rate"),
    category: varchar("category", { length: 100 }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    keywordPlatformIdx: uniqueIndex("trends_keyword_platform_idx").on(
      table.keyword,
      table.platform
    )
  })
);

export const eventCalendar = pgTable("event_calendar", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  eventType: varchar("event_type", { length: 32 })
    .notNull()
    .default("promotion"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  affectedCategories: jsonb("affected_categories"),
  priority: integer("priority").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export const listingTasks = pgTable("listing_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  targetPlatform: varchar("target_platform", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  externalListingId: varchar("external_listing_id", { length: 180 }),
  errorMessage: text("error_message"),
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  costCents: integer("cost_cents").notNull(),
  listPriceCents: integer("list_price_cents").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow(),
  changeReason: varchar("change_reason", { length: 100 }).default("manual")
});

export const complianceChecks = pgTable("compliance_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  checkType: varchar("check_type", { length: 64 }).notNull(),
  passed: boolean("passed").notNull(),
  details: jsonb("details"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow()
});

export const trendHistory = pgTable("trend_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyword: varchar("keyword", { length: 200 }).notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  score: integer("score").notNull(),
  growthRate: real("growth_rate"),
  observedAt: timestamp("observed_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export const abTests = pgTable("ab_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  variants: jsonb("variants").notNull(),
  winnerVariantId: varchar("winner_variant_id", { length: 120 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export const inventoryAlerts = pgTable("inventory_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  skuId: varchar("sku_id", { length: 180 }),
  alertType: varchar("alert_type", { length: 48 }).notNull(),
  severity: varchar("severity", { length: 24 }).notNull().default("medium"),
  message: text("message").notNull(),
  daysRemaining: real("days_remaining"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export const supplierPerformance = pgTable("supplier_performance", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull(),
  promisedShipHours: integer("promised_ship_hours"),
  actualShipHours: integer("actual_ship_hours"),
  returnRate: real("return_rate"),
  responseHours: real("response_hours"),
  cooperationCount: integer("cooperation_count").notNull().default(0),
  cooperationAmountCents: integer("cooperation_amount_cents")
    .notNull()
    .default(0),
  measuredAt: timestamp("measured_at", { withTimezone: true }).defaultNow()
});

export const supplierAlternatives = pgTable("supplier_alternatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  priority: integer("priority").notNull().default(0),
  active: boolean("active").notNull().default(true),
  switchReason: varchar("switch_reason", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export const reviewInsights = pgTable("review_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  sentiment: varchar("sentiment", { length: 24 }).notNull(),
  keywords: jsonb("keywords").notNull(),
  issueCategory: varchar("issue_category", { length: 80 }),
  score: real("score").notNull(),
  collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow()
});

export const platformRules = pgTable("platform_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: varchar("platform", { length: 32 }).notNull(),
  ruleType: varchar("rule_type", { length: 64 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  contentHash: varchar("content_hash", { length: 120 }).notNull(),
  sourceUrl: varchar("source_url", { length: 1000 }),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow()
});

export const exchangeRateSnapshots = pgTable("exchange_rate_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
  quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
  rate: real("rate").notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow()
});
