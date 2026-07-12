import { describe, expect, it } from "vitest";

import {
  AttributeNormalizer,
  CategoryClassifier,
  CommerceWorkflowOrchestrator,
  ExperimentPlanner,
  ImageCreativePlanner,
  ListingPerformanceEvaluator,
  PlatformAttributeMapper,
  PlatformCapabilityMatrix,
  PricingGuardrails,
  ProductLifecyclePolicy,
  SelectionScheduler,
  SupplierReliabilityEvaluator,
  type CommerceWorkflowDependencies,
  type SourceProductDetail
} from "../src/index.js";

const sourceProduct: SourceProductDetail = {
  sourceProductId: "1688-1",
  sourceUrl: "https://detail.1688.com/offer/1688-1.html",
  title: "Summer cotton loose fit T shirt",
  description: "Breathable cotton short sleeve top for women.",
  sourceCategoryId: "apparel-top",
  specs: {
    material: "cotton",
    color: "navy blue",
    size: "L",
    gender: "women"
  },
  skus: [
    {
      skuId: "sku-blue-l",
      attributes: {
        Color: "navy blue",
        Size: "large"
      },
      stock: 250,
      priceCents: 2200
    }
  ],
  images: [
    {
      url: "https://supplier.example/image-1.jpg",
      hasWatermark: true,
      hasBrandMark: true,
      hasModel: true
    }
  ],
  supplier: {
    supplierId: "supplier-1",
    name: "Yiwu Supplier",
    reliabilityScore: 82,
    responseRate: 0.94,
    disputeRate: 0.02,
    shippingPunctuality: 0.91,
    priceVolatility: 0.04,
    inventoryStability: 0.89
  },
  inventory: {
    availableStock: 250,
    expectedDailySales: 8
  },
  pricing: {
    sourcePriceCents: 2200,
    domesticShippingCents: 300,
    platformFeeRate: 0.05,
    paymentFeeRate: 0.01,
    adAllowanceCents: 200,
    couponBudgetCents: 100,
    expectedRefundCostCents: 120,
    packagingCents: 80,
    serviceCostCents: 100,
    listPriceCents: 5200
  },
  trendScore: 88,
  complianceRisk: "low"
};

describe("commerce workflow optimization primitives", () => {
  it("classifies, normalizes, maps, and gates category attributes with provenance", () => {
    const classifier = new CategoryClassifier();
    const normalizer = new AttributeNormalizer();
    const mapper = new PlatformAttributeMapper();

    const category = classifier.classify(sourceProduct);
    const normalized = normalizer.normalize(sourceProduct, category.category);
    const mapped = mapper.map({
      platform: "pdd",
      internalCategory: category.category,
      attributes: normalized.attributes
    });

    expect(category).toMatchObject({
      category: "apparel",
      sourceType: "inferred",
      confidence: "high"
    });
    expect(normalized.attributes).toMatchObject({
      material: {
        value: "cotton",
        originalValue: "cotton",
        sourceType: "supplier_spec",
        confidence: "high"
      },
      color: {
        value: "blue",
        originalValue: "navy blue",
        sourceType: "supplier_spec",
        confidence: "high"
      },
      size: {
        value: "L",
        originalValue: "L",
        sourceType: "supplier_spec",
        confidence: "high"
      }
    });
    expect(mapped).toMatchObject({
      platform: "pdd",
      platformCategoryId: "pdd_apparel_top",
      confidence: "high",
      publishDecision: "auto_publish"
    });
    expect(mapped.requiredFieldsMissing).toEqual([]);
    expect(mapped.properties).toMatchObject({
      color_name: "blue",
      size_spec: "L",
      material_name: "cotton"
    });
  });

  it("creates image generation prompts and routes risky creative work to review", () => {
    const planner = new ImageCreativePlanner();

    const plan = planner.plan({
      product: sourceProduct,
      platform: "douyin",
      hotKeywords: ["summer outfit", "breathable cotton"],
      targetStyle: "clean studio ecommerce",
      normalizedAttributes: {
        material: {
          value: "cotton",
          originalValue: "cotton",
          sourceType: "supplier_spec",
          confidence: "high"
        }
      }
    });

    expect(plan.prompts).toHaveLength(3);
    expect(plan.prompts[0]).toMatchObject({
      imageType: "main",
      mustPreserve: ["material: cotton"],
      mustAvoid: expect.arrayContaining([
        "supplier watermark",
        "supplier brand marks",
        "distinctive copied composition"
      ])
    });
    expect(plan.checks).toMatchObject({
      ocrRequired: true,
      similarityRequired: true,
      truthfulnessRequired: true,
      complianceRequired: true
    });
    expect(plan.reviewDecision).toBe("review_required");
    expect(plan.riskReasons).toContain("source image contains removable supplier marks");
  });

  it("selects candidates, evaluates lifecycle actions, supplier fallback, pricing, platform capability, experiments, and operations metrics", () => {
    const lifecycle = new ProductLifecyclePolicy({
      storeMaturity: "new",
      activeListingCapacity: 500
    });
    const scheduler = new SelectionScheduler(lifecycle);
    const evaluator = new ListingPerformanceEvaluator(lifecycle);
    const suppliers = new SupplierReliabilityEvaluator();
    const pricing = new PricingGuardrails();
    const capabilities = new PlatformCapabilityMatrix({
      pdd: {
        productCreate: "official_api",
        imageUpload: "official_api",
        delist: "official_api",
        analyticsSync: "official_api"
      },
      douyin: {
        productCreate: "rpa_fallback",
        imageUpload: "official_api",
        delist: "rpa_fallback",
        analyticsSync: "official_api"
      },
      taobao: {
        productCreate: "mock_only",
        imageUpload: "mock_only",
        delist: "manual_only",
        analyticsSync: "manual_only"
      }
    });
    const experiments = new ExperimentPlanner();

    const selected = scheduler.select([
      {
        sourceProductId: "1688-1",
        productScore: 86,
        grossMargin: 0.32,
        supplierReliability: 82,
        availableStockDays: 31,
        compliancePassed: true,
        attributeStatus: "complete",
        imageConfidence: "high",
        platformMappingConfidence: "high"
      },
      {
        sourceProductId: "1688-2",
        productScore: 74,
        grossMargin: 0.28,
        supplierReliability: 78,
        availableStockDays: 10,
        compliancePassed: true,
        attributeStatus: "missing_non_critical",
        imageConfidence: "medium",
        platformMappingConfidence: "medium"
      }
    ]);

    expect(selected.quota).toBe(5);
    expect(selected.tasks.map((task) => task.decision)).toEqual([
      "auto_list",
      "manual_review"
    ]);
    expect(
      evaluator.evaluate({
        listingId: "listing-1",
        ageDays: 7,
        impressions: 1200,
        clicks: 5,
        orders: 0,
        grossMargin: 0.28,
        refundRate: 0,
        stockDays: 20,
        sourcePriceChangeRate: 0
      }).action
    ).toBe("delist");
    expect(
      suppliers.recommend({
        currentSupplier: sourceProduct.supplier,
        alternatives: [
          { ...sourceProduct.supplier, supplierId: "supplier-2", reliabilityScore: 76 },
          { ...sourceProduct.supplier, supplierId: "supplier-3", reliabilityScore: 58 }
        ],
        dailySales: 8,
        campaignTraffic: false,
        stockDays: 5,
        sourcePriceChangeRate: 0.1,
        promisedShippingTimeMultiplier: 1.2
      })
    ).toMatchObject({
      action: "switch_recommended",
      requiredBackupSupplierCount: 1,
      rankedBackupSupplierIds: ["supplier-2"]
    });
    expect(pricing.evaluate(sourceProduct.pricing)).toMatchObject({
      decision: "allow",
      grossMargin: expect.any(Number)
    });
    expect(capabilities.resolveRoute("pdd", "productCreate")).toMatchObject({
      allowed: true,
      route: "official_api"
    });
    expect(capabilities.resolveRoute("taobao", "productCreate")).toMatchObject({
      allowed: false,
      route: "mock_only"
    });
    expect(
      experiments.plan({
        productScore: 86,
        title: sourceProduct.title,
        imageUrls: ["https://cdn.example/main.jpg"],
        description: sourceProduct.description
      }).variants
    ).toHaveLength(3);
  });

  it("orchestrates idempotent publish jobs with status transitions, generated content, audit events, and observability", async () => {
    const dependencies: CommerceWorkflowDependencies = {
      async fetchSourceProduct(sourceProductId) {
        return {
          ...sourceProduct,
          sourceProductId,
          images: [
            {
              url: "https://supplier.example/clean-image-1.jpg",
              hasWatermark: false,
              hasBrandMark: false,
              hasModel: false
            }
          ]
        };
      },
      async uploadImage({ platform, prompt }) {
        return `https://cdn.example/${platform}/${prompt.imageType}.jpg`;
      },
      async publishListing({ platform, listing }) {
        return {
          externalListingId: `${platform}-${listing.productId}`,
          status: "live"
        };
      },
      now() {
        return new Date("2026-07-12T01:00:00.000Z");
      }
    };
    const orchestrator = new CommerceWorkflowOrchestrator(dependencies);

    const first = await orchestrator.publish({
      sourceProductIds: ["1688-1"],
      targetPlatforms: ["pdd"],
      reviewMode: "auto",
      operatorId: "ops-1"
    });
    const duplicate = await orchestrator.publish({
      sourceProductIds: ["1688-1"],
      targetPlatforms: ["pdd"],
      reviewMode: "auto",
      operatorId: "ops-1"
    });

    expect(first.accepted).toBe(1);
    expect(duplicate.accepted).toBe(0);
    expect(duplicate.duplicates).toEqual(["1688-1:pdd"]);
    expect(first.tasks[0]).toMatchObject({
      idempotencyKey: "1688-1:pdd",
      sourceProductId: "1688-1",
      platform: "pdd",
      status: "live",
      externalListingId: "pdd-1688-1"
    });
    expect(first.tasks[0]?.statusHistory.map((item) => item.status)).toEqual([
      "pending",
      "generating_content",
      "generating_images",
      "validating_attributes",
      "uploading_images",
      "listing",
      "live"
    ]);
    expect(first.tasks[0]?.listingPayload).toMatchObject({
      title: expect.stringContaining("Summer cotton loose fit T shirt"),
      imageUrls: [
        "https://cdn.example/pdd/main.jpg",
        "https://cdn.example/pdd/scenario.jpg",
        "https://cdn.example/pdd/detail.jpg"
      ],
      attributes: {
        color_name: "blue"
      }
    });
    expect(first.auditEvents.map((event) => event.action)).toEqual([
      "created",
      "generated_content",
      "generated_images",
      "validated_attributes",
      "uploaded_images",
      "published"
    ]);
    expect(first.metrics).toMatchObject({
      candidatesScanned: 1,
      contentGenerated: 1,
      listingsCreated: 1,
      listingsLive: 1,
      reviewRequired: 0,
      failures: 0
    });
  });

  it("blocks hard-stop listings instead of routing them to review", async () => {
    const orchestrator = new CommerceWorkflowOrchestrator({
      async fetchSourceProduct(sourceProductId) {
        return {
          ...sourceProduct,
          sourceProductId,
          specs: {
            color: "navy blue"
          },
          pricing: {
            ...sourceProduct.pricing,
            listPriceCents: 2600
          }
        };
      },
      async uploadImage({ platform, prompt }) {
        return `https://cdn.example/${platform}/${prompt.imageType}.jpg`;
      },
      async publishListing() {
        throw new Error("blocked listings must not publish");
      }
    });

    const result = await orchestrator.publish({
      sourceProductIds: ["1688-blocked"],
      targetPlatforms: ["pdd"],
      reviewMode: "auto",
      operatorId: "ops-1"
    });

    expect(result.tasks[0]).toMatchObject({
      sourceProductId: "1688-blocked",
      platform: "pdd",
      status: "blocked"
    });
    expect(result.auditEvents.at(-1)).toMatchObject({
      action: "blocked"
    });
    expect(result.metrics).toMatchObject({
      reviewRequired: 0,
      failures: 1
    });
  });

  it("honors manual review mode even when all auto-publish checks pass", async () => {
    const orchestrator = new CommerceWorkflowOrchestrator({
      async fetchSourceProduct(sourceProductId) {
        return {
          ...sourceProduct,
          sourceProductId,
          images: [
            {
              url: "https://supplier.example/clean-image-1.jpg",
              hasWatermark: false,
              hasBrandMark: false,
              hasModel: false
            }
          ]
        };
      },
      async uploadImage({ platform, prompt }) {
        return `https://cdn.example/${platform}/${prompt.imageType}.jpg`;
      },
      async publishListing() {
        throw new Error("manual review mode must not publish");
      }
    });

    const result = await orchestrator.publish({
      sourceProductIds: ["1688-manual"],
      targetPlatforms: ["pdd"],
      reviewMode: "manual",
      operatorId: "ops-1"
    });

    expect(result.tasks[0]).toMatchObject({
      status: "review_required"
    });
    expect(result.metrics).toMatchObject({
      listingsLive: 0,
      reviewRequired: 1
    });
  });

  it("allows retry after a failed publish attempt instead of burning the idempotency key", async () => {
    let publishCalls = 0;
    const orchestrator = new CommerceWorkflowOrchestrator({
      async fetchSourceProduct(sourceProductId) {
        return {
          ...sourceProduct,
          sourceProductId,
          images: [
            {
              url: "https://supplier.example/clean-image-1.jpg",
              hasWatermark: false,
              hasBrandMark: false,
              hasModel: false
            }
          ]
        };
      },
      async uploadImage({ platform, prompt }) {
        return `https://cdn.example/${platform}/${prompt.imageType}.jpg`;
      },
      async publishListing({ platform, listing }) {
        publishCalls += 1;
        if (publishCalls === 1) {
          throw new Error("temporary platform failure");
        }
        return {
          externalListingId: `${platform}-${listing.productId}`,
          status: "live"
        };
      }
    });

    const failed = await orchestrator.publish({
      sourceProductIds: ["1688-retry"],
      targetPlatforms: ["pdd"],
      reviewMode: "auto",
      operatorId: "ops-1"
    });
    const retried = await orchestrator.publish({
      sourceProductIds: ["1688-retry"],
      targetPlatforms: ["pdd"],
      reviewMode: "auto",
      operatorId: "ops-1"
    });

    expect(failed.tasks[0]).toMatchObject({
      status: "error",
      errorMessage: "temporary platform failure"
    });
    expect(retried).toMatchObject({
      accepted: 1,
      duplicates: []
    });
    expect(retried.tasks[0]).toMatchObject({
      status: "live",
      externalListingId: "pdd-1688-retry"
    });
  });
});
