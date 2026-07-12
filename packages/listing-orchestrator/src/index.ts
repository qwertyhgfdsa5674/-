import { z } from "zod";

export const ListingStatusSchema = z.enum([
  "pending",
  "generating_content",
  "generating_images",
  "validating_attributes",
  "uploading_images",
  "listing",
  "live",
  "review_required",
  "blocked",
  "error",
  "dead_letter"
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const ListingProductSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  priceCents: z.number().int().positive(),
  stock: z.number().int().nonnegative(),
  images: z.array(z.string()).default([]),
  categoryId: z.string().optional()
});
export type ListingProduct = z.infer<typeof ListingProductSchema>;

export interface PlatformListingClient {
  readonly platform: string;
  publish(product: ListingProduct): Promise<{ externalListingId: string }>;
  updateStock(externalListingId: string, stock: number): Promise<void>;
  delist(externalListingId: string): Promise<void>;
}

export interface ListingTaskResult {
  platform: string;
  status: ListingStatus;
  externalListingId?: string;
  errorMessage?: string;
}

export class ListingOrchestrator {
  public constructor(
    private readonly clients: PlatformListingClient[],
    private readonly maxRetries = 2
  ) {}

  public async publishToAll(
    product: ListingProduct
  ): Promise<ListingTaskResult[]> {
    const parsed = ListingProductSchema.parse(product);
    const results = await Promise.all(
      this.clients.map((client) => this.publishWithRetry(client, parsed))
    );
    return results;
  }

  private async publishWithRetry(
    client: PlatformListingClient,
    product: ListingProduct
  ): Promise<ListingTaskResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const result = await client.publish(product);
        return {
          platform: client.platform,
          status: "live",
          externalListingId: result.externalListingId
        };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      platform: client.platform,
      status: "dead_letter",
      errorMessage:
        lastError instanceof Error ? lastError.message : String(lastError)
    };
  }
}

export class InMemoryListingMap {
  private readonly records = new Map<string, string>();

  public set(
    productId: string,
    platform: string,
    externalListingId: string
  ): void {
    this.records.set(key(productId, platform), externalListingId);
  }

  public get(productId: string, platform: string): string | undefined {
    return this.records.get(key(productId, platform));
  }
}

function key(productId: string, platform: string): string {
  return `${platform}:${productId}`;
}

export * from "./commerce-workflow.js";
