import { z } from "zod";

export const PddConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.number().int().positive().optional(),
  apiBaseUrl: z
    .string()
    .url()
    .default("https://gw-api.pinduoduo.com/api/router"),
  tokenUrl: z
    .string()
    .url()
    .default("https://open-api.pinduoduo.com/oauth/token"),
  requestsPerSecond: z.number().int().positive().default(5),
  signMethod: z.enum(["md5", "sha256"]).default("md5")
});

export type PddConfig = Partial<z.input<typeof PddConfigSchema>>;
export type ResolvedPddConfig = z.output<typeof PddConfigSchema>;

export const PddSkuSchema = z.object({
  skuId: z.string().optional(),
  outerSkuId: z.string().optional(),
  spec: z.record(z.string()),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative()
});
export type PddSku = z.infer<typeof PddSkuSchema>;

export const AddGoodsParamsSchema = z.object({
  categoryId: z.string().min(1),
  goodsName: z.string().min(1),
  goodsDesc: z.string().min(1),
  images: z.array(z.string().url()).min(1),
  skuList: z.array(PddSkuSchema).min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  outerGoodsId: z.string().optional(),
  shipmentLimitSecond: z.number().int().positive().optional(),
  freightTemplateId: z.string().optional()
});
export type AddGoodsParams = z.infer<typeof AddGoodsParamsSchema>;

export const AddGoodsResultSchema = z.object({
  goodsId: z.string().min(1),
  goodsUrl: z.string().url(),
  status: z.enum(["success", "reviewing", "failed"])
});
export type AddGoodsResult = z.infer<typeof AddGoodsResultSchema>;

export const UpdateGoodsParamsSchema = AddGoodsParamsSchema.partial().extend({
  goodsId: z.string().min(1)
});
export type UpdateGoodsParams = z.infer<typeof UpdateGoodsParamsSchema>;

export const GoodsListQuerySchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  isOnsale: z.boolean().optional(),
  goodsName: z.string().optional()
});
export type GoodsListQuery = z.infer<typeof GoodsListQuerySchema>;

export const GoodsSummarySchema = z.object({
  goodsId: z.string().min(1),
  goodsName: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  isOnsale: z.boolean()
});
export type GoodsSummary = z.infer<typeof GoodsSummarySchema>;

export const GoodsListResultSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(GoodsSummarySchema)
});
export type GoodsListResult = z.infer<typeof GoodsListResultSchema>;

export const GoodsDetailSchema = GoodsSummarySchema.extend({
  goodsDesc: z.string(),
  images: z.array(z.string().url()),
  skuList: z.array(PddSkuSchema),
  categoryId: z.string().min(1)
});
export type GoodsDetail = z.infer<typeof GoodsDetailSchema>;

export const OrderListQuerySchema = z.object({
  startUpdatedAt: z.string().min(1),
  endUpdatedAt: z.string().min(1),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  orderStatus: z.string().optional()
});
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;

export const OrderSkuSchema = z.object({
  skuId: z.string().min(1),
  goodsId: z.string().min(1),
  goodsName: z.string().min(1),
  spec: z.record(z.string()),
  quantity: z.number().int().positive()
});
export type OrderSku = z.infer<typeof OrderSkuSchema>;

export const OrderDetailSchema = z.object({
  orderSn: z.string().min(1),
  goodsName: z.string().min(1),
  buyerName: z.string().min(1),
  receiverAddress: z.string().min(1),
  receiverPhone: z.string().optional(),
  skuList: z.array(OrderSkuSchema),
  status: z.string().min(1),
  payment: z.number().nonnegative()
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export const OrderListResultSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(OrderDetailSchema)
});
export type OrderListResult = z.infer<typeof OrderListResultSchema>;

export const LogisticsInfoSchema = z.object({
  companyId: z.string().min(1),
  trackingNumber: z.string().min(1)
});
export type LogisticsInfo = z.infer<typeof LogisticsInfoSchema>;

export const LogisticsCompanySchema = z.object({
  companyId: z.string().min(1),
  companyName: z.string().min(1)
});
export type LogisticsCompany = z.infer<typeof LogisticsCompanySchema>;

export const ImageFileSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  data: z.instanceof(Uint8Array),
  url: z.string().url().optional()
});
export type ImageFile = z.infer<typeof ImageFileSchema>;

export const ProductDataSchema = AddGoodsParamsSchema.omit({ images: true });
export type ProductData = z.infer<typeof ProductDataSchema>;

export const PddOrderSchema = z.object({
  orderSn: z.string().min(1)
});
export type PddOrder = z.infer<typeof PddOrderSchema>;

export const TokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresIn: z.number().int().positive().optional(),
  expiresAt: z.number().int().positive().optional()
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const PddEnvelopeSchema = z.object({
  error_response: z
    .object({
      error_code: z.union([z.string(), z.number()]),
      error_msg: z.string().optional()
    })
    .optional()
});
