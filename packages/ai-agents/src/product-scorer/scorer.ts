import {
  ProductScoreInputSchema,
  type DimensionScores,
  type ProductRecommendation,
  type ProductScoreInput,
  type ProductScoreOutput,
  type ScoringConfig
} from "./schemas.js";
import {
  createDefaultStrategies,
  type DimensionKey,
  type DimensionScoringStrategy
} from "./strategies.js";
import { resolveScoringConfig } from "./config.js";

export class ProductScorer {
  private readonly config: ScoringConfig;
  private readonly strategies: Map<DimensionKey, DimensionScoringStrategy>;

  public constructor(
    args: {
      config?: Partial<ScoringConfig>;
      strategies?: DimensionScoringStrategy[];
    } = {}
  ) {
    this.config = resolveScoringConfig(args.config);
    this.strategies = new Map(
      (args.strategies ?? createDefaultStrategies()).map((strategy) => [
        strategy.key,
        strategy
      ])
    );
  }

  public async score(input: ProductScoreInput): Promise<ProductScoreOutput> {
    const parsedInput = ProductScoreInputSchema.parse(input);
    const dimensionScores = this.scoreDimensions(parsedInput);
    const totalScore = roundScore(
      Object.entries(dimensionScores).reduce((total, [key, score]) => {
        return total + score * this.config.weights[key as DimensionKey];
      }, 0)
    );
    const riskFlags = createRiskFlags(parsedInput, dimensionScores);

    return {
      totalScore,
      dimensionScores,
      rank: 1,
      recommendation: recommend(totalScore, riskFlags),
      riskFlags,
      summary: createSummary(parsedInput, totalScore, riskFlags)
    };
  }

  public async batchScore(
    inputs: ProductScoreInput[]
  ): Promise<ProductScoreOutput[]> {
    const scored = await Promise.all(inputs.map((input) => this.score(input)));
    const sorted = [...scored].sort(
      (left, right) => right.totalScore - left.totalScore
    );
    const rankByOutput = new Map<ProductScoreOutput, number>();

    sorted.forEach((output, index) => {
      rankByOutput.set(output, index + 1);
    });

    return scored.map((output) => ({
      ...output,
      rank: rankByOutput.get(output) ?? 1
    }));
  }

  private scoreDimensions(input: ProductScoreInput): DimensionScores {
    return {
      priceCompetitiveness: this.scoreDimension("priceCompetitiveness", input),
      supplierReliability: this.scoreDimension("supplierReliability", input),
      productQuality: this.scoreDimension("productQuality", input),
      fulfillmentCapability: this.scoreDimension(
        "fulfillmentCapability",
        input
      ),
      profitMargin: this.scoreDimension("profitMargin", input),
      trendTimeliness: this.scoreDimension("trendTimeliness", input)
    };
  }

  private scoreDimension(key: DimensionKey, input: ProductScoreInput): number {
    const strategy = this.strategies.get(key);

    if (!strategy) {
      throw new Error(`Missing product scoring strategy: ${key}`);
    }

    return roundScore(strategy.score(input));
  }
}

export async function batchScore(
  inputs: ProductScoreInput[],
  config?: Partial<ScoringConfig>
): Promise<ProductScoreOutput[]> {
  return new ProductScorer({ config }).batchScore(inputs);
}

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

function recommend(score: number, riskFlags: string[]): ProductRecommendation {
  if (
    riskFlags.includes("negative_profit") ||
    riskFlags.includes("out_of_stock")
  ) {
    return score >= 75 ? "consider" : "pass";
  }

  if (score >= 80) {
    return "strong_buy";
  }

  if (score >= 70) {
    return "buy";
  }

  if (score >= 55) {
    return "consider";
  }

  return "pass";
}

function createRiskFlags(
  input: ProductScoreInput,
  scores: DimensionScores
): string[] {
  const totalStock = input.product.skus.reduce(
    (total, sku) => total + sku.stock,
    0
  );
  const totalCost =
    input.cost.unitPrice + input.cost.shipping + input.cost.platformFee;
  const flags: string[] = [];

  if (totalStock <= 0) {
    flags.push("out_of_stock");
  }

  if (input.cost.targetPrice <= totalCost) {
    flags.push("negative_profit");
  }

  if (input.supplier.disputeRate > 0.08) {
    flags.push("high_dispute_rate");
  }

  if (scores.priceCompetitiveness < 30) {
    flags.push("weak_price_competitiveness");
  }

  if (input.marketData.competitorCount > 200) {
    flags.push("crowded_market");
  }

  if ((input.trendSignals?.obsoleteRisk ?? 0) >= 75) {
    flags.push("obsolete_trend_risk");
  }

  if ((scores.trendTimeliness ?? 0) < 35) {
    flags.push("weak_trend_match");
  }

  return flags;
}

function createSummary(
  input: ProductScoreInput,
  score: number,
  riskFlags: string[]
): string {
  const riskText =
    riskFlags.length > 0
      ? `, watch ${riskFlags.slice(0, 2).join(", ")}`
      : ", no major risk flags";

  return `${input.product.title} scored ${score}/100 with ${input.supplier.companyName}${riskText}.`;
}
