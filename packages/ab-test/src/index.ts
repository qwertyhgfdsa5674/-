import { z } from "zod";

export const VariantMetricsSchema = z.object({
  impressions: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  conversions: z.number().int().nonnegative().default(0)
});
export type VariantMetrics = z.infer<typeof VariantMetricsSchema>;

export const ContentVariantSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  imageUrl: z.string().url().optional(),
  description: z.string().optional(),
  metrics: VariantMetricsSchema.default({})
});
export type ContentVariant = z.infer<typeof ContentVariantSchema>;

export interface WinnerResult {
  winner?: ContentVariant;
  confidence: number;
  reason: string;
  variantScores: Array<{ id: string; score: number; conversionRate: number }>;
}

export class AbTestAnalyzer {
  public pickWinner(
    variants: ContentVariant[],
    minImpressions = 500
  ): WinnerResult {
    const parsed = variants.map((variant) =>
      ContentVariantSchema.parse(variant)
    );
    const scores = parsed.map((variant) => {
      const conversionRate =
        variant.metrics.impressions > 0
          ? variant.metrics.conversions / variant.metrics.impressions
          : 0;
      const ctr =
        variant.metrics.impressions > 0
          ? variant.metrics.clicks / variant.metrics.impressions
          : 0;
      return {
        id: variant.id,
        score: conversionRate * 0.75 + ctr * 0.25,
        conversionRate
      };
    });
    const ranked = [...scores].sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const second = ranked[1];
    const winner = best
      ? parsed.find((variant) => variant.id === best.id)
      : undefined;
    const totalImpressions = parsed.reduce(
      (total, variant) => total + variant.metrics.impressions,
      0
    );

    if (!best || totalImpressions < minImpressions) {
      return {
        confidence: 0,
        reason: "Sample size is not large enough.",
        variantScores: scores
      };
    }

    const lift = second
      ? (best.score - second.score) / Math.max(second.score, 0.001)
      : 1;
    const confidence = Math.min(0.99, Math.max(0, lift * 2));

    return {
      winner,
      confidence,
      reason:
        confidence >= 0.8
          ? "Winner has sufficient lift over the next variant."
          : "Winner is leading but needs more traffic for significance.",
      variantScores: scores
    };
  }

  public assignVariant(
    userKey: string,
    variants: ContentVariant[]
  ): ContentVariant {
    const parsed = variants.map((variant) =>
      ContentVariantSchema.parse(variant)
    );
    if (parsed.length === 0)
      throw new Error("At least one variant is required.");
    const bucket = hash(userKey) % parsed.length;
    const variant = parsed[bucket];
    if (!variant) throw new Error("Variant assignment failed.");
    return variant;
  }
}

function hash(value: string): number {
  return [...value].reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) >>> 0,
    7
  );
}
