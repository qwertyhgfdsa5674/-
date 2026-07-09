import type { ProductScoreInput } from "./schemas.js";

export type DimensionKey =
  | "priceCompetitiveness"
  | "supplierReliability"
  | "productQuality"
  | "fulfillmentCapability"
  | "profitMargin";

export interface DimensionScoringStrategy {
  readonly key: DimensionKey;
  score(input: ProductScoreInput): number;
}

export class PriceCompetitivenessStrategy implements DimensionScoringStrategy {
  public readonly key = "priceCompetitiveness" as const;

  public score(input: ProductScoreInput): number {
    const raw =
      ((input.marketData.platformAvgPrice - input.cost.unitPrice) /
        input.marketData.platformAvgPrice) *
      100;

    return clampScore(raw);
  }
}

export class SupplierReliabilityStrategy implements DimensionScoringStrategy {
  public readonly key = "supplierReliability" as const;

  public score(input: ProductScoreInput): number {
    const yearsScore = clampScore((input.supplier.years / 10) * 100);
    const disputeScore = clampScore(
      (1 - normalizeRate(input.supplier.disputeRate)) * 100
    );
    const responseScore = clampScore(
      normalizeRate(input.supplier.responseRate) * 100
    );

    return clampScore(
      yearsScore * 0.4 + disputeScore * 0.4 + responseScore * 0.2
    );
  }
}

export class ProductQualityStrategy implements DimensionScoringStrategy {
  public readonly key = "productQuality" as const;

  public score(input: ProductScoreInput): number {
    const positiveReviewRate = normalizeRate(
      readQualityMetric(input, "positiveReviewRate", 0.85)
    );
    const returnRate = normalizeRate(
      readQualityMetric(input, "returnRate", 0.08)
    );
    const hasRealPhotos = readQualityFlag(
      input,
      "hasRealPhotos",
      input.product.images.length >= 3
    );
    const realPhotoScore = hasRealPhotos ? 100 : 0;

    return clampScore(
      positiveReviewRate * 50 +
        (1 - returnRate) * 100 * 0.3 +
        realPhotoScore * 0.2
    );
  }
}

export class FulfillmentCapabilityStrategy implements DimensionScoringStrategy {
  public readonly key = "fulfillmentCapability" as const;

  public score(input: ProductScoreInput): number {
    const totalStock = input.product.skus.reduce(
      (total, sku) => total + sku.stock,
      0
    );
    const stockDepthScore = clampScore((totalStock / 500) * 100);
    const shippingHours = readFulfillmentMetric(input, "shippingHours", 48);
    const shippingSpeedScore =
      shippingHours <= 24 ? 100 : shippingHours <= 48 ? 75 : 45;
    const logisticsScore = clampScore(
      readFulfillmentMetric(input, "logisticsScore", 80)
    );

    return clampScore(
      stockDepthScore * 0.4 + shippingSpeedScore * 0.35 + logisticsScore * 0.25
    );
  }
}

export class ProfitMarginStrategy implements DimensionScoringStrategy {
  public readonly key = "profitMargin" as const;

  public score(input: ProductScoreInput): number {
    const totalCost =
      input.cost.unitPrice + input.cost.shipping + input.cost.platformFee;
    const margin =
      (input.cost.targetPrice - totalCost) / input.cost.targetPrice;

    if (margin >= 0.3) {
      return 100;
    }

    if (margin >= 0.2) {
      return 70;
    }

    if (margin >= 0.1) {
      return 50;
    }

    return 20;
  }
}

export function createDefaultStrategies(): DimensionScoringStrategy[] {
  return [
    new PriceCompetitivenessStrategy(),
    new SupplierReliabilityStrategy(),
    new ProductQualityStrategy(),
    new FulfillmentCapabilityStrategy(),
    new ProfitMarginStrategy()
  ];
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function normalizeRate(value: number): number {
  if (value > 1) {
    return value / 100;
  }

  return value;
}

function readQualityMetric(
  input: ProductScoreInput,
  key: "positiveReviewRate" | "returnRate",
  fallback: number
): number {
  return input.qualityMetrics?.[key] ?? fallback;
}

function readQualityFlag(
  input: ProductScoreInput,
  key: "hasRealPhotos",
  fallback: boolean
): boolean {
  return input.qualityMetrics?.[key] ?? fallback;
}

function readFulfillmentMetric(
  input: ProductScoreInput,
  key: "shippingHours" | "logisticsScore",
  fallback: number
): number {
  return input.fulfillmentMetrics?.[key] ?? fallback;
}
