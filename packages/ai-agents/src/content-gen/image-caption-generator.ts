import type { ProductDetail } from "@ai-ecommerce/platform-alibaba1688";

import { createCacheKey, InMemoryContentGenerationCache } from "./cache.js";
import { ContentComplianceChecker } from "./compliance.js";
import { IMAGE_CAPTION_DEFAULT_MAX_TOKENS } from "./constants.js";
import { minPrice, sellingPoints } from "./product-utils.js";
import { ImageCaptionSchema } from "./schemas.js";
import { DailyTokenBudgetController } from "./token-budget.js";
import type { ContentGenerationDeps, ImageCaption } from "./types.js";

export class ImageCaptionGenerator {
  private readonly cache;
  private readonly compliance;
  private readonly budget;
  private readonly preferredProvider: "openai" | "anthropic";
  private readonly preferredModel: string;

  public constructor(private readonly deps: ContentGenerationDeps = {}) {
    this.cache = deps.cache ?? new InMemoryContentGenerationCache();
    this.compliance = deps.compliance ?? new ContentComplianceChecker();
    this.budget = deps.budget ?? new DailyTokenBudgetController();
    this.preferredProvider = deps.aiProvider
      ? (deps.preferredProvider ?? "anthropic")
      : "anthropic";
    this.preferredModel =
      deps.preferredProvider === "openai"
        ? "gpt-4o-mini"
        : "claude-haiku-4-5-20251001";
  }

  public async generate(
    imageUrl: string,
    context: ProductDetail
  ): Promise<ImageCaption> {
    const cacheKey = createCacheKey("image-caption", { imageUrl, context });
    const cached = this.cache.get<ImageCaption>(cacheKey);

    if (cached) {
      return cached;
    }

    const generated = await this.generateWithProvider(imageUrl, context);
    const caption = generated ?? fallbackCaption(context);
    const sanitized = {
      ...caption,
      overlayText: this.compliance.sanitize(caption.overlayText)
    };

    this.cache.set(cacheKey, sanitized);
    return sanitized;
  }

  private async generateWithProvider(
    imageUrl: string,
    context: ProductDetail
  ): Promise<ImageCaption | undefined> {
    if (!this.deps.aiProvider) {
      return undefined;
    }

    this.budget.assertCanSpend(450);

    const result = await this.deps.aiProvider.generateJson<ImageCaption>({
      provider: this.preferredProvider,
      model: this.preferredModel,
      temperature: 0.6,
      system:
        "你是电商主图文案专家。根据图片 URL 和商品信息生成短促、合规、适合叠加在主图上的 JSON 文案。",
      user: JSON.stringify({
        imageUrl,
        title: context.title,
        price: minPrice(context),
        sellingPoints: sellingPoints(context)
      }),
      maxOutputTokens: IMAGE_CAPTION_DEFAULT_MAX_TOKENS
    });

    this.budget.record(result.usage);

    const parsed = ImageCaptionSchema.safeParse(result.data);
    return parsed.success ? parsed.data : undefined;
  }
}

function fallbackCaption(product: ProductDetail): ImageCaption {
  const price = minPrice(product);
  const point = sellingPoints(product)[0];

  if (price > 0) {
    return {
      overlayText: `${formatPrice(price)}元起`,
      position: "bottom",
      style: "price_tag",
      color: "#F97316"
    };
  }

  if (point) {
    return {
      overlayText: point.length > 10 ? point.slice(0, 10) : point,
      position: "center",
      style: "feature_badge",
      color: "#2563EB"
    };
  }

  return {
    overlayText: "限时上新",
    position: "top",
    style: "urgency_banner",
    color: "#DC2626"
  };
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(1);
}
