import { describe, expect, it } from "vitest";
import {
  ProductScorer,
  resolveScoringConfig,
  type ProductScoreInput
} from "../src/product-scorer/index.js";

const baseInput: ProductScoreInput = {
  product: {
    id: "product-1",
    title: "Stainless Steel Cup",
    description: "Insulated cup with real photos.",
    images: [
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/3.jpg"
    ],
    skus: [
      {
        spec: "white",
        price: 30,
        stock: 300
      },
      {
        spec: "black",
        price: 30,
        stock: 300
      }
    ],
    priceLevels: [
      {
        minQty: 1,
        price: 30
      }
    ],
    specs: {}
  },
  supplier: {
    id: "seller-1",
    companyName: "Yiwu Sample Factory",
    creditLevel: 5,
    years: 8,
    isFactory: true,
    disputeRate: 0.02,
    responseRate: 0.95
  },
  marketData: {
    platformAvgPrice: 80,
    searchVolume: 5000,
    competitorCount: 60
  },
  cost: {
    unitPrice: 30,
    shipping: 5,
    platformFee: 3,
    targetPrice: 69
  },
  qualityMetrics: {
    positiveReviewRate: 0.96,
    returnRate: 0.04,
    hasRealPhotos: true
  },
  fulfillmentMetrics: {
    shippingHours: 24,
    logisticsScore: 90
  }
};

describe("ProductScorer", () => {
  it("scores a normal product and ranks a batch automatically", async () => {
    const scorer = new ProductScorer();
    const weakerInput: ProductScoreInput = {
      ...baseInput,
      product: {
        ...baseInput.product,
        id: "product-2",
        title: "Weak Margin Cup"
      },
      cost: {
        ...baseInput.cost,
        unitPrice: 60
      }
    };

    const results = await scorer.batchScore([baseInput, weakerInput]);
    const strong = results[0]!;
    const weak = results[1]!;

    expect(strong.totalScore).toBeGreaterThan(80);
    expect(strong.rank).toBe(1);
    expect(strong.recommendation).toBe("strong_buy");
    expect(weak.rank).toBe(2);
    expect(weak.totalScore).toBeLessThan(strong.totalScore);
  });

  it("flags zero inventory as out of stock", async () => {
    const scorer = new ProductScorer();
    const output = await scorer.score({
      ...baseInput,
      product: {
        ...baseInput.product,
        skus: baseInput.product.skus.map((sku) => ({
          ...sku,
          stock: 0
        }))
      }
    });

    expect(output.dimensionScores.fulfillmentCapability).toBeLessThan(70);
    expect(output.riskFlags).toContain("out_of_stock");
    expect(output.recommendation).not.toBe("strong_buy");
  });

  it("flags negative profit and gives the lowest profit margin score", async () => {
    const scorer = new ProductScorer();
    const output = await scorer.score({
      ...baseInput,
      cost: {
        unitPrice: 70,
        shipping: 8,
        platformFee: 5,
        targetPrice: 80
      }
    });

    expect(output.dimensionScores.profitMargin).toBe(20);
    expect(output.riskFlags).toContain("negative_profit");
  });

  it("validates that scoring weights sum to 1", () => {
    expect(() =>
      resolveScoringConfig({
        weights: {
          priceCompetitiveness: 0.5,
          supplierReliability: 0.25,
          productQuality: 0.2,
          fulfillmentCapability: 0.15,
          profitMargin: 0.1
        }
      })
    ).toThrow(/sum to 1/);
  });
});
