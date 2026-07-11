import { z } from "zod";

export const DouyinConfigSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  shopId: z.string().min(1)
});

export type DouyinConfig = z.infer<typeof DouyinConfigSchema>;

export const DouyinListingSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  priceCents: z.number().int().positive(),
  stock: z.number().int().nonnegative(),
  images: z.array(z.string()).default([]),
  categoryId: z.string().optional()
});
export type DouyinListing = z.infer<typeof DouyinListingSchema>;

export class DouyinClient {
  public readonly platform = "douyin";

  public constructor(private readonly config: DouyinConfig) {}

  public getConfig(): DouyinConfig {
    return this.config;
  }

  public async publish(
    product: DouyinListing
  ): Promise<{ externalListingId: string }> {
    const parsed = DouyinListingSchema.parse(product);
    return { externalListingId: `douyin-${parsed.productId}` };
  }

  public async updateStock(
    externalListingId: string,
    stock: number
  ): Promise<void> {
    this.logAction("updateStock", { externalListingId, stock });
  }

  public async delist(externalListingId: string): Promise<void> {
    this.logAction("delist", { externalListingId });
  }

  public async getOrders(): Promise<unknown[]> {
    return [];
  }

  public async shipOrder(orderId: string, trackingNo: string): Promise<void> {
    this.logAction("shipOrder", { orderId, trackingNo });
  }

  private logAction(method: string, params: Record<string, unknown>): void {
    console.info(
      JSON.stringify({
        service: "douyin",
        method,
        params,
        status: "mock"
      })
    );
  }
}
