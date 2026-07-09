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
