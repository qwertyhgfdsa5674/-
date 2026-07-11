import { z } from "zod";

export const TaobaoConfigSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  sessionKey: z.string().optional()
});

export type TaobaoConfig = z.infer<typeof TaobaoConfigSchema>;

export const TaobaoListingSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  priceCents: z.number().int().positive(),
  stock: z.number().int().nonnegative(),
  images: z.array(z.string()).default([]),
  categoryId: z.string().optional()
});
export type TaobaoListing = z.infer<typeof TaobaoListingSchema>;

export class TaobaoClient {
  public readonly platform = "taobao";

  public constructor(private readonly config: TaobaoConfig) {}

  public getConfig(): TaobaoConfig {
    return this.config;
  }

  public async publish(
    product: TaobaoListing
  ): Promise<{ externalListingId: string }> {
    const parsed = TaobaoListingSchema.parse(product);
    return { externalListingId: `taobao-${parsed.productId}` };
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
        service: "taobao",
        method,
        params,
        status: "mock"
      })
    );
  }
}
