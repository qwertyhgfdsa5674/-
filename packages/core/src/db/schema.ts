import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
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
