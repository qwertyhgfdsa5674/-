import { z } from "zod";

export const PricingModeSchema = z.enum([
  "penetration",
  "competitive",
  "premium",
  "dynamic"
]);
export type PricingMode = z.infer<typeof PricingModeSchema>;

export const PricingInputSchema = z.object({
  productId: z.string().min(1),
  costCents: z.number().int().positive(),
  platformFeeRate: z.number().min(0).max(0.8).default(0.08),
  minProfitRate: z.number().min(0).max(1).default(0.15),
  currentPriceCents: z.number().int().positive().optional(),
  competitorPricesCents: z.array(z.number().int().positive()).default([]),
  inventoryUnits: z.number().int().nonnegative().default(0),
  dailySalesVelocity: z.number().nonnegative().default(0),
  exclusive: z.boolean().default(false),
  mode: PricingModeSchema.default("dynamic")
});
export type PricingInput = z.infer<typeof PricingInputSchema>;

export interface PricingDecision {
  productId: string;
  recommendedPriceCents: number;
  floorPriceCents: number;
  mode: PricingMode;
  reason: string;
  audit: Record<string, unknown>;
}

export class DynamicPricingEngine {
  public recommend(input: PricingInput): PricingDecision {
    const parsed = PricingInputSchema.parse(input);
    const floorPriceCents = Math.ceil(
      parsed.costCents / (1 - parsed.platformFeeRate - parsed.minProfitRate)
    );
    const competitorMedian = median(parsed.competitorPricesCents);
    const target = this.calculateTarget(
      parsed,
      floorPriceCents,
      competitorMedian
    );
    const recommendedPriceCents = Math.max(floorPriceCents, Math.round(target));

    return {
      productId: parsed.productId,
      recommendedPriceCents,
      floorPriceCents,
      mode: parsed.mode,
      reason: explain(parsed, recommendedPriceCents, competitorMedian),
      audit: {
        currentPriceCents: parsed.currentPriceCents,
        competitorMedian,
        inventoryUnits: parsed.inventoryUnits,
        dailySalesVelocity: parsed.dailySalesVelocity
      }
    };
  }

  private calculateTarget(
    input: PricingInput,
    floorPriceCents: number,
    competitorMedian?: number
  ): number {
    if (input.mode === "penetration") return floorPriceCents * 1.05;
    if (input.mode === "premium" || input.exclusive)
      return floorPriceCents * 1.45;
    if (input.mode === "competitive" && competitorMedian) {
      return competitorMedian * 0.97;
    }

    const inventoryPressure =
      input.dailySalesVelocity > 0
        ? input.inventoryUnits / Math.max(input.dailySalesVelocity, 1)
        : 60;
    const base = competitorMedian
      ? competitorMedian * 0.98
      : floorPriceCents * 1.25;

    if (inventoryPressure < 7) return base * 1.08;
    if (inventoryPressure > 45) return base * 0.93;
    return base;
  }
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const middleValue = sorted[middle];
  if (middleValue === undefined) return undefined;
  if (sorted.length % 2 === 1) return middleValue;
  return Math.round(((sorted[middle - 1] ?? middleValue) + middleValue) / 2);
}

function explain(
  input: PricingInput,
  recommendedPriceCents: number,
  competitorMedian?: number
): string {
  if (input.exclusive)
    return "Exclusive product uses premium price protection.";
  if (competitorMedian && recommendedPriceCents < competitorMedian) {
    return "Price stays slightly below competitor median while respecting floor.";
  }
  if (input.inventoryUnits > 0 && input.dailySalesVelocity === 0) {
    return "No recent sales velocity; price is conservative to stimulate demand.";
  }
  return "Price balances margin, inventory depth, and market competition.";
}
