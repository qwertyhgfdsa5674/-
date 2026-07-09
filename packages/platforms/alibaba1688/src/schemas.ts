import { z } from "zod";

export const Alibaba1688ConfigSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.number().int().positive().optional(),
  apiBaseUrl: z.string().url().default("https://gw.open.1688.com/openapi"),
  tokenUrl: z.string().url().default("https://gw.open.1688.com/openapi/http/1/system.oauth2/getToken"),
  requestsPerMinute: z.number().int().positive().default(10)
});

export type Alibaba1688Config = Partial<z.input<typeof Alibaba1688ConfigSchema>>;
export type ResolvedAlibaba1688Config = z.output<typeof Alibaba1688ConfigSchema>;

export const SearchParamsSchema = z.object({
  keyword: z.string().min(1),
  categoryId: z.string().optional(),
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().nonnegative().optional(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100)
});
export type SearchParams = z.infer<typeof SearchParamsSchema>;

export const PriceRangeSchema = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative()
});

export const ProductSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  priceRange: PriceRangeSchema,
  moq: z.number().int().nonnegative(),
  image: z.string().url(),
  sellerId: z.string().min(1)
});
export type ProductSummary = z.infer<typeof ProductSummarySchema>;

export const SearchResultSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(ProductSummarySchema)
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SKUSchema = z.object({
  spec: z.string().min(1),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative()
});
export type SKU = z.infer<typeof SKUSchema>;

export const PriceLevelSchema = z.object({
  minQty: z.number().int().positive(),
  price: z.number().nonnegative()
});
export type PriceLevel = z.infer<typeof PriceLevelSchema>;

export const ProductDetailSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  images: z.array(z.string().url()),
  skus: z.array(SKUSchema),
  priceLevels: z.array(PriceLevelSchema),
  specs: z.record(z.unknown())
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

export const SellerInfoSchema = z.object({
  id: z.string().min(1),
  companyName: z.string().min(1),
  creditLevel: z.number().nonnegative(),
  years: z.number().int().nonnegative(),
  isFactory: z.boolean(),
  disputeRate: z.number().nonnegative(),
  responseRate: z.number().nonnegative()
});
export type SellerInfo = z.infer<typeof SellerInfoSchema>;

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().optional(),
  isLeaf: z.boolean().default(false)
});
export type Category = z.infer<typeof CategorySchema>;

export const PriceInfoSchema = z.object({
  productId: z.string().min(1),
  priceRange: PriceRangeSchema,
  priceLevels: z.array(PriceLevelSchema)
});
export type PriceInfo = z.infer<typeof PriceInfoSchema>;

export const InventoryInfoSchema = z.object({
  productId: z.string().min(1),
  totalStock: z.number().int().nonnegative(),
  skus: z.array(SKUSchema)
});
export type InventoryInfo = z.infer<typeof InventoryInfoSchema>;

export const OrderParamsSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  skuSpec: z.string().optional(),
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
  receiverAddress: z.string().min(1),
  idempotencyKey: z.string().min(1)
});
export type OrderParams = z.infer<typeof OrderParamsSchema>;

export const OrderResultSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["created", "paid", "failed"]),
  message: z.string().optional()
});
export type OrderResult = z.infer<typeof OrderResultSchema>;

export const LogisticsInfoSchema = z.object({
  orderId: z.string().min(1),
  company: z.string().optional(),
  trackingNumber: z.string().optional(),
  status: z.string().min(1),
  traces: z.array(
    z.object({
      time: z.string().min(1),
      content: z.string().min(1)
    })
  )
});
export type LogisticsInfo = z.infer<typeof LogisticsInfoSchema>;

export const TokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresIn: z.number().int().positive().optional(),
  expiresAt: z.number().int().positive().optional()
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const OpenApiEnvelopeSchema = z.object({
  success: z.boolean().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  result: z.unknown().optional()
});
