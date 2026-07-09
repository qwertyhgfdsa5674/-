import {
  ProductDetailSchema,
  SellerInfoSchema,
  type ProductDetail,
  type SellerInfo
} from "@ai-ecommerce/platform-alibaba1688";
import { z } from "zod";

export const ScoreWeightsSchema = z.object({
  priceCompetitiveness: z.number().nonnegative(),
  supplierReliability: z.number().nonnegative(),
  productQuality: z.number().nonnegative(),
  fulfillmentCapability: z.number().nonnegative(),
  profitMargin: z.number().nonnegative()
});

export type ScoreWeights = z.infer<typeof ScoreWeightsSchema>;

export const PricingStrategySchema = z.enum([
  "low_price",
  "mid_volume",
  "high_margin"
]);
export type PricingStrategy = z.infer<typeof PricingStrategySchema>;

export const ScoringConfigSchema = z
  .object({
    weights: ScoreWeightsSchema,
    pricingStrategy: PricingStrategySchema
  })
  .superRefine((config, context) => {
    const total = sumWeights(config.weights);

    if (Math.abs(total - 1) > 0.0001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Scoring weights must sum to 1. Received ${total.toFixed(4)}.`
      });
    }
  });

export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

export const DefaultScoringConfig = {
  weights: {
    priceCompetitiveness: 0.3,
    supplierReliability: 0.25,
    productQuality: 0.2,
    fulfillmentCapability: 0.15,
    profitMargin: 0.1
  },
  pricingStrategy: "mid_volume"
} satisfies ScoringConfig;

export const ProductScoreInputSchema = z.object({
  product: ProductDetailSchema,
  supplier: SellerInfoSchema,
  marketData: z.object({
    platformAvgPrice: z.number().positive(),
    searchVolume: z.number().nonnegative(),
    competitorCount: z.number().int().nonnegative(),
    salesVelocity: z.number().nonnegative().optional(),
    conversionRate: z.number().nonnegative().optional()
  }),
  cost: z.object({
    unitPrice: z.number().nonnegative(),
    shipping: z.number().nonnegative(),
    platformFee: z.number().nonnegative(),
    targetPrice: z.number().positive(),
    estimatedAdCost: z.number().nonnegative().optional(),
    expectedRefundCost: z.number().nonnegative().optional()
  }),
  qualityMetrics: z
    .object({
      positiveReviewRate: z.number().nonnegative().optional(),
      returnRate: z.number().nonnegative().optional(),
      hasRealPhotos: z.boolean().optional()
    })
    .optional(),
  fulfillmentMetrics: z
    .object({
      shippingHours: z.number().nonnegative().optional(),
      logisticsScore: z.number().min(0).max(100).optional()
    })
    .optional()
});

export interface ProductScoreInput extends z.infer<
  typeof ProductScoreInputSchema
> {
  product: ProductDetail;
  supplier: SellerInfo;
}

export const DimensionScoresSchema = ScoreWeightsSchema;
export type DimensionScores = z.infer<typeof DimensionScoresSchema>;

export const ProductRecommendationSchema = z.enum([
  "strong_buy",
  "buy",
  "consider",
  "pass"
]);
export type ProductRecommendation = z.infer<typeof ProductRecommendationSchema>;

export const ProductScoreOutputSchema = z.object({
  totalScore: z.number().min(0).max(100),
  dimensionScores: DimensionScoresSchema,
  rank: z.number().int().positive(),
  recommendation: ProductRecommendationSchema,
  riskFlags: z.array(z.string()),
  summary: z.string().min(1)
});

export type ProductScoreOutput = z.infer<typeof ProductScoreOutputSchema>;

export function sumWeights(weights: ScoreWeights): number {
  return Object.values(weights).reduce((total, weight) => total + weight, 0);
}
