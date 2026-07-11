import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import {
  DefaultScoringConfig,
  ScoringConfigSchema,
  type PricingStrategy,
  type ScoringConfig,
  type ScoreWeights
} from "./schemas.js";

const STRATEGY_WEIGHT_ADJUSTMENTS: Record<
  PricingStrategy,
  Partial<ScoreWeights>
> = {
  low_price: {
    priceCompetitiveness: 0.35,
    supplierReliability: 0.17,
    productQuality: 0.13,
    fulfillmentCapability: 0.13,
    profitMargin: 0.07,
    trendTimeliness: 0.15
  },
  mid_volume: DefaultScoringConfig.weights,
  high_margin: {
    priceCompetitiveness: 0.17,
    supplierReliability: 0.18,
    productQuality: 0.18,
    fulfillmentCapability: 0.12,
    profitMargin: 0.22,
    trendTimeliness: 0.13
  }
};

export async function loadScoringConfig(path: string): Promise<ScoringConfig> {
  const content = await readFile(path, "utf8");
  const parsed = path.endsWith(".json")
    ? JSON.parse(content)
    : parseYaml(content);

  return resolveScoringConfig(parsed);
}

export function resolveScoringConfig(
  config: Partial<ScoringConfig> = {}
): ScoringConfig {
  const pricingStrategy =
    config.pricingStrategy ?? DefaultScoringConfig.pricingStrategy;
  const weights = {
    ...DefaultScoringConfig.weights,
    ...STRATEGY_WEIGHT_ADJUSTMENTS[pricingStrategy],
    ...config.weights
  };

  return ScoringConfigSchema.parse({
    pricingStrategy,
    weights
  });
}
