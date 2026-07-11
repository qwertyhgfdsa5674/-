import { z } from "zod";

export const ProductStatusSchema = z.enum(["draft", "active", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: ProductStatusSchema.default("draft"),
  sourceUrl: z.string().url().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type Product = z.infer<typeof ProductSchema>;

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  platform: z.enum(["pdd", "taobao", "alibaba1688", "manual"]),
  externalId: z.string().optional(),
  reliabilityScore: z.number().min(0).max(100).default(0)
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(["douyin", "taobao", "pdd"]),
  externalOrderId: z.string().min(1),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  status: z.enum(["pending", "paid", "fulfilled", "cancelled", "refunded"])
});
export type Order = z.infer<typeof OrderSchema>;

export const PricingSchema = z.object({
  productId: z.string().uuid(),
  costCents: z.number().int().nonnegative(),
  listPriceCents: z.number().int().nonnegative(),
  currency: z.literal("CNY").default("CNY")
});
export type Pricing = z.infer<typeof PricingSchema>;

export const TrendSchema = z.object({
  id: z.string().uuid(),
  keyword: z.string().min(1).max(200),
  platform: z.string().min(1).max(32),
  score: z.number().int().min(0).max(100).default(0),
  source: z.string().max(64).default("mock"),
  growthRate: z.number().optional(),
  category: z.string().max(100).optional(),
  firstSeenAt: z.date(),
  lastUpdatedAt: z.date()
});
export type Trend = z.infer<typeof TrendSchema>;

export const EventCalendarSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  eventType: z.string().max(32).default("promotion"),
  startsAt: z.date(),
  endsAt: z.date(),
  affectedCategories: z.unknown().optional(),
  priority: z.number().int().default(0),
  notes: z.string().optional(),
  createdAt: z.date().optional()
});
export type EventCalendar = z.infer<typeof EventCalendarSchema>;

export const ListingTaskSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  targetPlatform: z.string().min(1).max(32),
  status: z.string().max(32).default("pending"),
  externalListingId: z.string().max(180).optional(),
  errorMessage: z.string().optional(),
  attempts: z.number().int().default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});
export type ListingTask = z.infer<typeof ListingTaskSchema>;

export const PriceHistorySchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  costCents: z.number().int().nonnegative(),
  listPriceCents: z.number().int().nonnegative(),
  changedAt: z.date().optional(),
  changeReason: z.string().max(100).default("manual")
});
export type PriceHistory = z.infer<typeof PriceHistorySchema>;

export const ComplianceCheckSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  checkType: z.string().min(1).max(64),
  passed: z.boolean(),
  details: z.unknown().optional(),
  checkedAt: z.date().optional()
});
export type ComplianceCheck = z.infer<typeof ComplianceCheckSchema>;
