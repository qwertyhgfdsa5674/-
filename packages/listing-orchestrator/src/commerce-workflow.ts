export type Platform = "douyin" | "pdd" | "taobao";
export type Confidence = "high" | "medium" | "low";
export type SourceType =
  | "supplier_spec"
  | "supplier_sku"
  | "inferred"
  | "generated"
  | "operator";
export type InternalCategory =
  | "apparel"
  | "shoes"
  | "electronics"
  | "home_goods"
  | "beauty"
  | "food"
  | "general";

export interface AttributeEvidence {
  value: string;
  originalValue: string;
  sourceType: SourceType;
  confidence: Confidence;
}

export type NormalizedAttributes = Record<string, AttributeEvidence>;

export interface SourceProductDetail {
  sourceProductId: string;
  sourceUrl: string;
  title: string;
  description: string;
  sourceCategoryId?: string;
  specs: Record<string, string>;
  skus: SourceSku[];
  images: SourceImage[];
  supplier: SupplierScorecard;
  inventory: {
    availableStock: number;
    expectedDailySales: number;
  };
  pricing: PricingInput;
  trendScore: number;
  complianceRisk: "low" | "medium" | "high";
}

export interface SourceSku {
  skuId: string;
  attributes: Record<string, string>;
  stock: number;
  priceCents: number;
}

export interface SourceImage {
  url: string;
  hasWatermark?: boolean;
  hasBrandMark?: boolean;
  hasModel?: boolean;
}

export interface SupplierScorecard {
  supplierId: string;
  name: string;
  reliabilityScore: number;
  responseRate: number;
  disputeRate: number;
  shippingPunctuality: number;
  priceVolatility: number;
  inventoryStability: number;
}

export interface PricingInput {
  sourcePriceCents: number;
  domesticShippingCents: number;
  platformFeeRate: number;
  paymentFeeRate: number;
  adAllowanceCents: number;
  couponBudgetCents: number;
  expectedRefundCostCents: number;
  packagingCents: number;
  serviceCostCents: number;
  listPriceCents: number;
}

export class CategoryClassifier {
  public classify(product: SourceProductDetail): {
    category: InternalCategory;
    sourceType: SourceType;
    confidence: Confidence;
    evidence: string[];
  } {
    const haystack = [
      product.sourceCategoryId,
      product.title,
      product.description,
      ...Object.keys(product.specs),
      ...Object.values(product.specs)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (matchesAny(haystack, ["apparel", "shirt", "t shirt", "clothing"])) {
      return {
        category: "apparel",
        sourceType: "inferred",
        confidence: "high",
        evidence: ["title/spec/category apparel signal"]
      };
    }
    if (matchesAny(haystack, ["shoe", "sneaker", "upper material"])) {
      return {
        category: "shoes",
        sourceType: "inferred",
        confidence: "high",
        evidence: ["shoe signal"]
      };
    }
    if (matchesAny(haystack, ["usb", "power", "capacity", "model"])) {
      return {
        category: "electronics",
        sourceType: "inferred",
        confidence: "medium",
        evidence: ["electronics signal"]
      };
    }
    if (matchesAny(haystack, ["skin", "shelf life", "net content"])) {
      return {
        category: "beauty",
        sourceType: "inferred",
        confidence: "medium",
        evidence: ["beauty signal"]
      };
    }

    return {
      category: "general",
      sourceType: "inferred",
      confidence: "low",
      evidence: ["no category-specific signal"]
    };
  }
}

export class AttributeNormalizer {
  public normalize(
    product: SourceProductDetail,
    category: InternalCategory
  ): {
    category: InternalCategory;
    attributes: NormalizedAttributes;
    confidence: Confidence;
  } {
    const attributes: NormalizedAttributes = {};
    const fields = requiredInternalFields(category);

    for (const field of fields) {
      const raw = findRawAttribute(product, field);
      if (!raw) {
        continue;
      }

      attributes[field] = {
        value: normalizeValue(field, raw.value),
        originalValue: raw.value,
        sourceType: raw.sourceType,
        confidence: "high"
      };
    }

    const confidence =
      fields.every((field) => attributes[field]?.confidence === "high")
        ? "high"
        : Object.keys(attributes).length > 0
          ? "medium"
          : "low";

    return {
      category,
      attributes,
      confidence
    };
  }
}

export class PlatformAttributeMapper {
  public map(input: {
    platform: Platform;
    internalCategory: InternalCategory;
    attributes: NormalizedAttributes;
  }): {
    platform: Platform;
    platformCategoryId: string;
    properties: Record<string, string>;
    requiredFieldsMissing: string[];
    confidence: Confidence;
    publishDecision: "auto_publish" | "review_required" | "blocked";
  } {
    const mapping = platformCategoryMappings[input.platform][input.internalCategory];
    const required = mapping.required;
    const properties: Record<string, string> = {};

    for (const [internalField, platformField] of Object.entries(mapping.fields)) {
      const attribute = input.attributes[internalField];
      if (attribute) {
        properties[platformField] = attribute.value;
      }
    }

    const requiredFieldsMissing = required.filter(
      (field) => !input.attributes[field]
    );
    const mappedConfidences = required
      .map((field) => input.attributes[field]?.confidence)
      .filter((confidence): confidence is Confidence => Boolean(confidence));
    const confidence =
      requiredFieldsMissing.length > 0
        ? "low"
        : mappedConfidences.every((value) => value === "high")
          ? "high"
          : "medium";

    return {
      platform: input.platform,
      platformCategoryId: mapping.platformCategoryId,
      properties,
      requiredFieldsMissing,
      confidence,
      publishDecision:
        requiredFieldsMissing.length > 0
          ? "blocked"
          : confidence === "high"
            ? "auto_publish"
            : "review_required"
    };
  }
}

export class ImageCreativePlanner {
  public plan(input: {
    product: SourceProductDetail;
    platform: Platform;
    hotKeywords: string[];
    targetStyle: string;
    normalizedAttributes: NormalizedAttributes;
  }): {
    prompts: ImagePrompt[];
    checks: {
      ocrRequired: boolean;
      similarityRequired: boolean;
      truthfulnessRequired: boolean;
      complianceRequired: boolean;
    };
    reviewDecision: "auto_publish" | "review_required" | "blocked";
    riskReasons: string[];
  } {
    const riskReasons: string[] = [];
    if (
      input.product.images.some(
        (image) => image.hasWatermark || image.hasBrandMark || image.hasModel
      )
    ) {
      riskReasons.push("source image contains removable supplier marks");
    }
    if (input.product.complianceRisk === "high") {
      riskReasons.push("product has high compliance risk");
    }

    const mustPreserve = Object.entries(input.normalizedAttributes).map(
      ([field, attribute]) => `${field}: ${attribute.value}`
    );
    const prompts: ImagePrompt[] = (["main", "scenario", "detail"] as const).map(
      (imageType) => ({
        imageType,
        platform: input.platform,
        prompt: [
          `Create an original ${imageType} listing image for ${input.product.title}.`,
          `Style: ${input.targetStyle}.`,
          `Use keywords: ${input.hotKeywords.join(", ")}.`,
          `Preserve factual attributes: ${mustPreserve.join("; ")}.`
        ].join(" "),
        factualReferenceImageUrls: input.product.images.map((image) => image.url),
        mustPreserve,
        mustAvoid: [
          "supplier watermark",
          "supplier brand marks",
          "distinctive copied composition",
          "unsupported certifications",
          "incorrect product material, size, or function"
        ]
      })
    );

    return {
      prompts,
      checks: {
        ocrRequired: true,
        similarityRequired: true,
        truthfulnessRequired: true,
        complianceRequired: true
      },
      reviewDecision:
        input.product.complianceRisk === "high"
          ? "blocked"
          : riskReasons.length > 0 || input.product.complianceRisk === "medium"
            ? "review_required"
            : "auto_publish",
      riskReasons
    };
  }
}

export interface ImagePrompt {
  imageType: "main" | "scenario" | "detail";
  platform: Platform;
  prompt: string;
  factualReferenceImageUrls: string[];
  mustPreserve: string[];
  mustAvoid: string[];
}

export class ProductLifecyclePolicy {
  public readonly thresholds: {
    dailyQuota: number;
    autoListScore: number;
    manualReviewScore: number;
    minAutoGrossMargin: number;
    blockGrossMargin: number;
    minSupplierReliability: number;
  };

  public constructor(config: {
    storeMaturity: "new" | "stable" | "mature";
    activeListingCapacity: number;
  }) {
    const matureQuota = Math.max(
      1,
      Math.floor(config.activeListingCapacity * 0.01)
    );
    this.thresholds = {
      dailyQuota:
        config.storeMaturity === "new"
          ? 5
          : config.storeMaturity === "stable"
            ? 10
            : matureQuota,
      autoListScore: 80,
      manualReviewScore: 70,
      minAutoGrossMargin: 0.25,
      blockGrossMargin: 0.15,
      minSupplierReliability: 60
    };
  }
}

export interface CandidateScore {
  sourceProductId: string;
  productScore: number;
  grossMargin: number;
  supplierReliability: number;
  availableStockDays: number;
  compliancePassed: boolean;
  attributeStatus: "complete" | "missing_non_critical" | "missing_required";
  imageConfidence: Confidence;
  platformMappingConfidence: Confidence;
}

export class SelectionScheduler {
  public constructor(private readonly policy: ProductLifecyclePolicy) {}

  public select(candidates: CandidateScore[]): {
    quota: number;
    evaluatedCandidateCount: number;
    tasks: Array<CandidateScore & { decision: "auto_list" | "manual_review" | "blocked" }>;
  } {
    const quota = this.policy.thresholds.dailyQuota;
    const tasks = candidates
      .slice()
      .sort((left, right) => right.productScore - left.productScore)
      .slice(0, quota * 10)
      .map((candidate) => ({
        ...candidate,
        decision: this.decide(candidate)
      }));

    return {
      quota,
      evaluatedCandidateCount: tasks.length,
      tasks
    };
  }

  private decide(candidate: CandidateScore): "auto_list" | "manual_review" | "blocked" {
    if (
      candidate.productScore < this.policy.thresholds.manualReviewScore ||
      candidate.grossMargin < this.policy.thresholds.blockGrossMargin ||
      candidate.supplierReliability < this.policy.thresholds.minSupplierReliability ||
      candidate.availableStockDays <= 0 ||
      !candidate.compliancePassed ||
      candidate.attributeStatus === "missing_required"
    ) {
      return "blocked";
    }

    if (
      candidate.productScore >= this.policy.thresholds.autoListScore &&
      candidate.grossMargin >= this.policy.thresholds.minAutoGrossMargin &&
      candidate.supplierReliability >= 75 &&
      candidate.availableStockDays >= 14 &&
      candidate.imageConfidence === "high" &&
      candidate.platformMappingConfidence === "high" &&
      candidate.attributeStatus === "complete"
    ) {
      return "auto_list";
    }

    return "manual_review";
  }
}

export class ListingPerformanceEvaluator {
  public constructor(private readonly policy: ProductLifecyclePolicy) {}

  public evaluate(input: {
    listingId: string;
    ageDays: number;
    impressions: number;
    clicks: number;
    orders: number;
    grossMargin: number;
    refundRate: number;
    stockDays: number;
    sourcePriceChangeRate: number;
    protected?: boolean;
  }): {
    listingId: string;
    action: "keep" | "optimize" | "pause" | "delist" | "review";
    reasons: string[];
  } {
    const reasons: string[] = [];
    const ctr = input.impressions > 0 ? input.clicks / input.impressions : 0;
    const conversion = input.clicks > 0 ? input.orders / input.clicks : 0;

    if (input.protected) {
      return { listingId: input.listingId, action: "keep", reasons: ["protected listing"] };
    }
    if (
      input.refundRate > 0.15 ||
      input.sourcePriceChangeRate > 0.08 ||
      input.stockDays <= 0
    ) {
      reasons.push("risk stop threshold reached");
      return { listingId: input.listingId, action: "pause", reasons };
    }
    if (input.ageDays >= 14 && input.impressions >= 2000 && input.orders === 0) {
      reasons.push("hard delist threshold reached");
      return { listingId: input.listingId, action: "delist", reasons };
    }
    if (
      input.ageDays >= 7 &&
      input.impressions >= 1000 &&
      input.orders === 0 &&
      ctr < 0.008
    ) {
      reasons.push("seven day no-order delist threshold reached");
      return { listingId: input.listingId, action: "delist", reasons };
    }
    if (input.ageDays >= 3 && input.impressions >= 300 && ctr < 0.005) {
      reasons.push("low CTR optimization threshold reached");
      return { listingId: input.listingId, action: "optimize", reasons };
    }
    if (input.clicks >= 100 && conversion < 0.003) {
      reasons.push("low conversion warning threshold reached");
      return { listingId: input.listingId, action: "pause", reasons };
    }
    if (input.grossMargin < this.policy.thresholds.blockGrossMargin) {
      reasons.push("margin below floor");
      return { listingId: input.listingId, action: "pause", reasons };
    }

    return { listingId: input.listingId, action: "keep", reasons };
  }
}

export class SupplierReliabilityEvaluator {
  public recommend(input: {
    currentSupplier: SupplierScorecard;
    alternatives: SupplierScorecard[];
    dailySales: number;
    campaignTraffic: boolean;
    stockDays: number;
    sourcePriceChangeRate: number;
    promisedShippingTimeMultiplier: number;
  }): {
    action: "keep" | "switch_recommended" | "pause_listing";
    requiredBackupSupplierCount: number;
    rankedBackupSupplierIds: string[];
    reasons: string[];
  } {
    const requiredBackupSupplierCount =
      input.dailySales >= 10 || input.campaignTraffic ? 2 : input.dailySales >= 3 ? 1 : 0;
    const ranked = input.alternatives
      .filter((supplier) => supplier.reliabilityScore >= 60)
      .sort((left, right) => right.reliabilityScore - left.reliabilityScore);
    const reasons: string[] = [];

    if (input.sourcePriceChangeRate > 0.08) reasons.push("source price shock");
    if (input.stockDays < 7) reasons.push("stock below seven days");
    if (input.promisedShippingTimeMultiplier >= 2) {
      reasons.push("promised shipping time doubled");
    }

    if (ranked.length === 0 && reasons.length > 0) {
      return {
        action: "pause_listing",
        requiredBackupSupplierCount,
        rankedBackupSupplierIds: [],
        reasons
      };
    }

    return {
      action: reasons.length > 0 ? "switch_recommended" : "keep",
      requiredBackupSupplierCount,
      rankedBackupSupplierIds: ranked.map((supplier) => supplier.supplierId),
      reasons
    };
  }
}

export class PricingGuardrails {
  public evaluate(input: PricingInput): {
    decision: "allow" | "review" | "block";
    landedCostCents: number;
    grossMargin: number;
    contributionMarginCents: number;
    reasons: string[];
  } {
    const feeCents = Math.round(
      input.listPriceCents * (input.platformFeeRate + input.paymentFeeRate)
    );
    const landedCostCents =
      input.sourcePriceCents +
      input.domesticShippingCents +
      feeCents +
      input.adAllowanceCents +
      input.couponBudgetCents +
      input.expectedRefundCostCents +
      input.packagingCents +
      input.serviceCostCents;
    const contributionMarginCents = input.listPriceCents - landedCostCents;
    const grossMargin = contributionMarginCents / Math.max(input.listPriceCents, 1);
    const reasons: string[] = [];

    if (grossMargin < 0.15) {
      reasons.push("net margin below 15% floor");
      return { decision: "block", landedCostCents, grossMargin, contributionMarginCents, reasons };
    }
    if (grossMargin < 0.25) {
      reasons.push("gross margin below default 25% target");
      return { decision: "review", landedCostCents, grossMargin, contributionMarginCents, reasons };
    }

    return { decision: "allow", landedCostCents, grossMargin, contributionMarginCents, reasons };
  }
}

export type PlatformSupportLevel =
  | "official_api"
  | "rpa_fallback"
  | "mock_only"
  | "manual_only"
  | "unsupported";
export type PlatformOperation =
  | "productCreate"
  | "imageUpload"
  | "delist"
  | "analyticsSync";

export class PlatformCapabilityMatrix {
  public constructor(
    private readonly matrix: Record<
      Platform,
      Partial<Record<PlatformOperation, PlatformSupportLevel>>
    >
  ) {}

  public resolveRoute(
    platform: Platform,
    operation: PlatformOperation,
    manuallyApproved = false
  ): {
    platform: Platform;
    operation: PlatformOperation;
    route: PlatformSupportLevel;
    allowed: boolean;
    requiresManualConfirmation: boolean;
  } {
    const route = this.matrix[platform]?.[operation] ?? "unsupported";
    const requiresManualConfirmation =
      route === "rpa_fallback" || route === "manual_only";
    return {
      platform,
      operation,
      route,
      allowed:
        route === "official_api" ||
        (route === "rpa_fallback" && manuallyApproved),
      requiresManualConfirmation
    };
  }
}

export class ExperimentPlanner {
  public plan(input: {
    productScore: number;
    title: string;
    imageUrls: string[];
    description: string;
  }): {
    variants: Array<{
      id: string;
      title: string;
      imageUrl: string;
      description: string;
    }>;
    evaluationRule: {
      minImpressions: number;
      minDays: number;
      minLift: number;
      protectRefundSignal: boolean;
    };
  } {
    const variantCount = input.productScore >= 80 ? 3 : 2;
    return {
      variants: Array.from({ length: variantCount }, (_, index) => ({
        id: `variant-${index + 1}`,
        title: index === 0 ? input.title : `${input.title} ${index + 1}`,
        imageUrl: input.imageUrls[index] ?? input.imageUrls[0] ?? "",
        description: input.description
      })),
      evaluationRule: {
        minImpressions: 500,
        minDays: 7,
        minLift: 0.2,
        protectRefundSignal: true
      }
    };
  }
}

export interface CommerceWorkflowDependencies {
  fetchSourceProduct(sourceProductId: string): Promise<SourceProductDetail>;
  uploadImage(input: {
    platform: Platform;
    sourceProduct: SourceProductDetail;
    prompt: ImagePrompt;
  }): Promise<string>;
  publishListing(input: {
    platform: Platform;
    sourceProduct: SourceProductDetail;
    listing: ListingPayload;
  }): Promise<{ externalListingId?: string; status: "live" | "review_required" | "error" }>;
  now?: () => Date;
  idempotencyStore?: CommerceWorkflowIdempotencyStore;
}

export interface CommerceWorkflowIdempotencyStore {
  has(idempotencyKey: string): boolean;
  commit(idempotencyKey: string): void;
}

export interface ListingPayload {
  productId: string;
  title: string;
  description: string;
  priceCents: number;
  stock: number;
  imageUrls: string[];
  categoryId: string;
  attributes: Record<string, string>;
  provenance: Record<string, { sourceType: SourceType; confidence: Confidence }>;
}

export type WorkflowListingStatus =
  | "pending"
  | "generating_content"
  | "generating_images"
  | "validating_attributes"
  | "uploading_images"
  | "listing"
  | "live"
  | "review_required"
  | "blocked"
  | "error"
  | "dead_letter";

export interface WorkflowTask {
  idempotencyKey: string;
  sourceProductId: string;
  platform: Platform;
  status: WorkflowListingStatus;
  externalListingId?: string;
  errorMessage?: string;
  statusHistory: Array<{ status: WorkflowListingStatus; at: string }>;
  listingPayload?: ListingPayload;
}

export interface AuditEvent {
  sourceProductId: string;
  platform: Platform;
  action:
    | "created"
    | "generated_content"
    | "generated_images"
    | "validated_attributes"
    | "uploaded_images"
    | "published"
    | "review_required"
    | "blocked"
    | "failed";
  operatorId: string;
  at: string;
}

export interface WorkflowMetrics {
  candidatesScanned: number;
  productsScored: number;
  productsSelected: number;
  contentGenerated: number;
  listingsCreated: number;
  listingsLive: number;
  reviewRequired: number;
  failures: number;
  optimizations: number;
  delistings: number;
}

export class CommerceWorkflowOrchestrator {
  private readonly idempotencyStore: CommerceWorkflowIdempotencyStore;
  private readonly classifier = new CategoryClassifier();
  private readonly normalizer = new AttributeNormalizer();
  private readonly mapper = new PlatformAttributeMapper();
  private readonly imagePlanner = new ImageCreativePlanner();
  private readonly pricing = new PricingGuardrails();

  public constructor(private readonly dependencies: CommerceWorkflowDependencies) {
    this.idempotencyStore =
      dependencies.idempotencyStore ??
      new InMemoryCommerceWorkflowIdempotencyStore();
  }

  public async publish(input: {
    sourceProductIds: string[];
    targetPlatforms: Platform[];
    reviewMode: "auto" | "manual" | "force_review";
    operatorId: string;
  }): Promise<{
    accepted: number;
    duplicates: string[];
    tasks: WorkflowTask[];
    auditEvents: AuditEvent[];
    metrics: WorkflowMetrics;
  }> {
    const duplicates: string[] = [];
    const tasks: WorkflowTask[] = [];
    const auditEvents: AuditEvent[] = [];

    for (const sourceProductId of input.sourceProductIds) {
      for (const platform of input.targetPlatforms) {
        const idempotencyKey = `${sourceProductId}:${platform}`;
        if (this.idempotencyStore.has(idempotencyKey)) {
          duplicates.push(idempotencyKey);
          continue;
        }

        const outcome = await this.publishOne({
          sourceProductId,
          platform,
          reviewMode: input.reviewMode,
          operatorId: input.operatorId,
          idempotencyKey
        });
        tasks.push(outcome.task);
        auditEvents.push(...outcome.auditEvents);
        if (outcome.task.status !== "error" && outcome.task.status !== "dead_letter") {
          this.idempotencyStore.commit(idempotencyKey);
        }
      }
    }

    return {
      accepted: tasks.length,
      duplicates,
      tasks,
      auditEvents,
      metrics: {
        candidatesScanned: input.sourceProductIds.length,
        productsScored: input.sourceProductIds.length,
        productsSelected: tasks.length,
        contentGenerated: tasks.filter((task) => task.listingPayload).length,
        listingsCreated: tasks.length,
        listingsLive: tasks.filter((task) => task.status === "live").length,
        reviewRequired: tasks.filter((task) => task.status === "review_required").length,
        failures: tasks.filter(
          (task) =>
            task.status === "error" ||
            task.status === "dead_letter" ||
            task.status === "blocked"
        ).length,
        optimizations: 0,
        delistings: 0
      }
    };
  }

  private async publishOne(input: {
    sourceProductId: string;
    platform: Platform;
    reviewMode: "auto" | "manual" | "force_review";
    operatorId: string;
    idempotencyKey: string;
  }): Promise<{ task: WorkflowTask; auditEvents: AuditEvent[] }> {
    const statusHistory: WorkflowTask["statusHistory"] = [];
    const auditEvents: AuditEvent[] = [];
    const pushStatus = (status: WorkflowListingStatus) => {
      statusHistory.push({ status, at: this.nowIso() });
    };
    const audit = (action: AuditEvent["action"]) => {
      auditEvents.push({
        sourceProductId: input.sourceProductId,
        platform: input.platform,
        action,
        operatorId: input.operatorId,
        at: this.nowIso()
      });
    };

    try {
      pushStatus("pending");
      audit("created");
      const sourceProduct = await this.dependencies.fetchSourceProduct(
        input.sourceProductId
      );

      pushStatus("generating_content");
      audit("generated_content");
      const category = this.classifier.classify(sourceProduct);
      const normalized = this.normalizer.normalize(sourceProduct, category.category);
      const imagePlan = this.imagePlanner.plan({
        product: sourceProduct,
        platform: input.platform,
        hotKeywords: [sourceProduct.title],
        targetStyle: `${input.platform} listing style`,
        normalizedAttributes: normalized.attributes
      });

      pushStatus("generating_images");
      const uploadedUrls = await Promise.all(
        imagePlan.prompts.map((prompt) =>
          this.dependencies.uploadImage({
            platform: input.platform,
            sourceProduct,
            prompt
          })
        )
      );
      audit("generated_images");

      pushStatus("validating_attributes");
      const mapped = this.mapper.map({
        platform: input.platform,
        internalCategory: normalized.category,
        attributes: normalized.attributes
      });
      const price = this.pricing.evaluate(sourceProduct.pricing);
      audit("validated_attributes");

      const listingPayload: ListingPayload = {
        productId: sourceProduct.sourceProductId,
        title: sourceProduct.title,
        description: sourceProduct.description,
        priceCents: sourceProduct.pricing.listPriceCents,
        stock: sourceProduct.inventory.availableStock,
        imageUrls: uploadedUrls,
        categoryId: mapped.platformCategoryId,
        attributes: mapped.properties,
        provenance: provenanceFromAttributes(normalized.attributes)
      };

      if (
        mapped.publishDecision === "blocked" ||
        imagePlan.reviewDecision === "blocked" ||
        price.decision === "block"
      ) {
        pushStatus("blocked");
        audit("blocked");
        return {
          task: {
            idempotencyKey: input.idempotencyKey,
            sourceProductId: input.sourceProductId,
            platform: input.platform,
            status: "blocked",
            statusHistory,
            listingPayload
          },
          auditEvents
        };
      }

      if (
        input.reviewMode === "force_review" ||
        input.reviewMode === "manual" ||
        mapped.publishDecision !== "auto_publish" ||
        imagePlan.reviewDecision !== "auto_publish" ||
        price.decision !== "allow"
      ) {
        pushStatus("review_required");
        audit("review_required");
        return {
          task: {
            idempotencyKey: input.idempotencyKey,
            sourceProductId: input.sourceProductId,
            platform: input.platform,
            status: "review_required",
            statusHistory,
            listingPayload
          },
          auditEvents
        };
      }

      pushStatus("uploading_images");
      audit("uploaded_images");
      pushStatus("listing");
      const published = await this.dependencies.publishListing({
        platform: input.platform,
        sourceProduct,
        listing: listingPayload
      });

      pushStatus(published.status);
      audit(published.status === "live" ? "published" : "review_required");
      return {
        task: {
          idempotencyKey: input.idempotencyKey,
          sourceProductId: input.sourceProductId,
          platform: input.platform,
          status: published.status,
          externalListingId: published.externalListingId,
          statusHistory,
          listingPayload
        },
        auditEvents
      };
    } catch (error) {
      pushStatus("error");
      audit("failed");
      return {
        task: {
          idempotencyKey: input.idempotencyKey,
          sourceProductId: input.sourceProductId,
          platform: input.platform,
          status: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
          statusHistory
        },
        auditEvents
      };
    }
  }

  private nowIso(): string {
    return (this.dependencies.now?.() ?? new Date()).toISOString();
  }
}

class InMemoryCommerceWorkflowIdempotencyStore
  implements CommerceWorkflowIdempotencyStore
{
  private readonly committed = new Set<string>();

  public has(idempotencyKey: string): boolean {
    return this.committed.has(idempotencyKey);
  }

  public commit(idempotencyKey: string): void {
    this.committed.add(idempotencyKey);
  }
}

function requiredInternalFields(category: InternalCategory): string[] {
  if (category === "apparel") return ["color", "size", "material", "gender"];
  if (category === "shoes") return ["size", "color", "upperMaterial"];
  if (category === "electronics") return ["model", "capacity", "interface"];
  if (category === "home_goods") return ["size", "material", "color"];
  if (category === "beauty") return ["netContent", "suitableSkinType"];
  if (category === "food") return ["flavor", "netWeight", "origin"];
  return ["color", "size", "material"];
}

function findRawAttribute(
  product: SourceProductDetail,
  field: string
): { value: string; sourceType: SourceType } | undefined {
  const aliases = fieldAliases[field] ?? [field];
  for (const alias of aliases) {
    const specValue = findCaseInsensitive(product.specs, alias);
    if (specValue) return { value: specValue, sourceType: "supplier_spec" };
  }
  for (const sku of product.skus) {
    for (const alias of aliases) {
      const skuValue = findCaseInsensitive(sku.attributes, alias);
      if (skuValue) return { value: skuValue, sourceType: "supplier_sku" };
    }
  }
  return undefined;
}

function findCaseInsensitive(
  record: Record<string, string>,
  key: string
): string | undefined {
  const normalizedKey = key.toLowerCase();
  const match = Object.entries(record).find(
    ([recordKey]) => recordKey.toLowerCase() === normalizedKey
  );
  return match?.[1];
}

function normalizeValue(field: string, value: string): string {
  const clean = value.trim();
  const lower = clean.toLowerCase();
  if (field === "color") {
    if (lower.includes("navy") || lower.includes("blue")) return "blue";
    if (lower.includes("black")) return "black";
    if (lower.includes("white")) return "white";
  }
  if (field === "size") {
    if (["large", "l"].includes(lower)) return "L";
    if (["medium", "m"].includes(lower)) return "M";
    if (["small", "s"].includes(lower)) return "S";
  }
  return clean;
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function provenanceFromAttributes(
  attributes: NormalizedAttributes
): Record<string, { sourceType: SourceType; confidence: Confidence }> {
  return Object.fromEntries(
    Object.entries(attributes).map(([field, attribute]) => [
      field,
      {
        sourceType: attribute.sourceType,
        confidence: attribute.confidence
      }
    ])
  );
}

const fieldAliases: Record<string, string[]> = {
  color: ["color", "colour", "Color"],
  size: ["size", "Size"],
  material: ["material", "fabric"],
  gender: ["gender"],
  upperMaterial: ["upper material", "upperMaterial"],
  model: ["model"],
  capacity: ["capacity"],
  interface: ["interface"],
  netContent: ["net content", "netContent"],
  suitableSkinType: ["suitable skin type", "suitableSkinType"],
  flavor: ["flavor"],
  netWeight: ["net weight", "netWeight"],
  origin: ["origin"]
};

const defaultMapping = {
  platformCategoryId: "general",
  fields: {
    color: "color",
    size: "size",
    material: "material"
  },
  required: ["color", "size", "material"]
};

const platformCategoryMappings: Record<
  Platform,
  Record<
    InternalCategory,
    {
      platformCategoryId: string;
      fields: Record<string, string>;
      required: string[];
    }
  >
> = {
  pdd: {
    apparel: {
      platformCategoryId: "pdd_apparel_top",
      fields: {
        color: "color_name",
        size: "size_spec",
        material: "material_name",
        gender: "gender"
      },
      required: ["color", "size", "material"]
    },
    shoes: defaultMapping,
    electronics: defaultMapping,
    home_goods: defaultMapping,
    beauty: defaultMapping,
    food: defaultMapping,
    general: defaultMapping
  },
  douyin: {
    apparel: {
      platformCategoryId: "douyin_apparel",
      fields: {
        color: "color",
        size: "size",
        material: "fabric",
        gender: "gender"
      },
      required: ["color", "size", "material"]
    },
    shoes: defaultMapping,
    electronics: defaultMapping,
    home_goods: defaultMapping,
    beauty: defaultMapping,
    food: defaultMapping,
    general: defaultMapping
  },
  taobao: {
    apparel: {
      platformCategoryId: "taobao_apparel",
      fields: {
        color: "颜色分类",
        size: "尺码",
        material: "材质",
        gender: "适用性别"
      },
      required: ["color", "size", "material"]
    },
    shoes: defaultMapping,
    electronics: defaultMapping,
    home_goods: defaultMapping,
    beauty: defaultMapping,
    food: defaultMapping,
    general: defaultMapping
  }
};
