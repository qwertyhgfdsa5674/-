export { loadScoringConfig, resolveScoringConfig } from "./config.js";
export { ProductScorer, batchScore } from "./scorer.js";
export * from "./schemas.js";
export {
  FulfillmentCapabilityStrategy,
  PriceCompetitivenessStrategy,
  ProductQualityStrategy,
  ProfitMarginStrategy,
  SupplierReliabilityStrategy,
  createDefaultStrategies,
  type DimensionKey,
  type DimensionScoringStrategy
} from "./strategies.js";
