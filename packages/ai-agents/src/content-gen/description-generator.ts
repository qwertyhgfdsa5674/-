import type { ProductDetail } from "@ai-ecommerce/platform-alibaba1688";

import { createCacheKey, InMemoryContentGenerationCache } from "./cache.js";
import { ContentComplianceChecker } from "./compliance.js";
import { DESCRIPTIONS_DEFAULT_MAX_OUTPUT_TOKENS } from "./constants.js";
import {
  escapeHtml,
  minPrice,
  productName,
  sellingPoints,
  specTable,
  unique
} from "./product-utils.js";
import { PromptTemplateManager } from "./prompt-template-manager.js";
import { ProductDescriptionSchema } from "./schemas.js";
import { DailyTokenBudgetController, estimateTokens } from "./token-budget.js";
import type {
  ContentGenerationDeps,
  ComplianceChecker,
  Platform,
  ProductDescription,
  SpecTable
} from "./types.js";

export class DescriptionGenerator {
  private readonly cache;
  private readonly compliance;
  private readonly budget;
  private readonly promptManager;

  public constructor(private readonly deps: ContentGenerationDeps = {}) {
    this.cache = deps.cache ?? new InMemoryContentGenerationCache();
    this.compliance = deps.compliance ?? new ContentComplianceChecker();
    this.budget = deps.budget ?? new DailyTokenBudgetController();
    this.promptManager = deps.promptManager ?? new PromptTemplateManager();
  }

  public async generate(
    product: ProductDetail,
    platform: Platform,
    templateName = `description-${platform}`
  ): Promise<ProductDescription> {
    const cacheKey = createCacheKey("description", {
      product,
      platform,
      templateName
    });
    const cached = this.cache.get<ProductDescription>(cacheKey);

    if (cached) {
      return cached;
    }

    const generated = await this.generateWithProvider(
      product,
      platform,
      templateName
    );
    const description = sanitizeDescription(
      this.compliance,
      generated ?? fallbackDescription(product, platform)
    );

    this.cache.set(cacheKey, description);
    return description;
  }

  private async generateWithProvider(
    product: ProductDetail,
    platform: Platform,
    templateName: string
  ): Promise<ProductDescription | undefined> {
    if (!this.deps.aiProvider) {
      return undefined;
    }

    const template = await this.promptManager.loadTemplate(templateName);
    const variables = {
      productName: product.title,
      platform,
      sellingPoints: sellingPoints(product),
      specs: specTable(product),
      price: minPrice(product),
      description: product.description
    };
    const rendered = await this.promptManager.render(template, variables);

    this.budget.assertCanSpend(estimateTokens(rendered) + 1200);

    const result = await this.deps.aiProvider.generateJson<ProductDescription>({
      provider: template.model.startsWith("gpt") ? "openai" : "anthropic",
      model: template.model,
      temperature: template.temperature,
      system: template.system,
      user: template.user,
      maxOutputTokens: DESCRIPTIONS_DEFAULT_MAX_OUTPUT_TOKENS
    });

    this.budget.record(result.usage);

    const parsed = ProductDescriptionSchema.safeParse(result.data);
    return parsed.success ? parsed.data : undefined;
  }
}

function fallbackDescription(
  product: ProductDetail,
  platform: Platform
): ProductDescription {
  const name = productName(product);
  const price = minPrice(product);
  const points = ensureSellingPoints(sellingPoints(product), name);
  const specs = specTable(product);
  const scenarios = scenarioList(platform, name);
  const trustFactors = trustFactorList(product);
  const painPoint = `还在为${name}不好选、价格不透明、到手体验不稳定发愁？`;
  const solution = `${name}围绕${points.slice(0, 2).join("、")}做优化，兼顾日常使用和性价比。`;
  const html = buildHtml({
    name,
    painPoint,
    solution,
    sellingPoints: points,
    specs,
    scenarios,
    trustFactors,
    price
  });
  const markdown = buildMarkdown({
    name,
    painPoint,
    solution,
    sellingPoints: points,
    specs,
    scenarios,
    trustFactors,
    price
  });

  return {
    painPoint,
    solution,
    sellingPoints: points,
    specs,
    scenarios,
    trustFactors,
    html,
    markdown
  };
}

function ensureSellingPoints(points: string[], name: string): string[] {
  return unique([
    ...points,
    `${name}实用百搭`,
    "多规格可选，适配不同需求",
    "源头供货，补货更稳定",
    "日常使用省心，送礼自用都合适"
  ]).slice(0, 5);
}

function scenarioList(platform: Platform, name: string): string[] {
  const base = [
    `日常自用：${name}高频使用更顺手`,
    `送礼场景：包装搭配灵活，不挑人群`
  ];

  if (platform === "douyin") {
    return [...base, "直播间转化：卖点清晰，适合短时间讲解"];
  }

  if (platform === "pdd") {
    return [...base, "家庭囤货：多人拼单，到手成本更友好"];
  }

  return [...base, "搜索进店：关键词清晰，适合场景化浏览"];
}

function trustFactorList(product: ProductDetail): string[] {
  const stock = product.skus.reduce((total, sku) => total + sku.stock, 0);
  const factors = ["规格参数清晰", "支持按需选款"];

  if (product.images.length >= 3) {
    factors.push("多图展示，细节更直观");
  }

  if (stock > 0) {
    factors.push(`现货库存${stock}件`);
  }

  if (product.priceLevels.length > 0) {
    factors.push("阶梯价格透明");
  }

  return factors.slice(0, 5);
}

function buildHtml(input: DescriptionBuildInput): string {
  return [
    `<section class="product-description">`,
    `<h2>${escapeHtml(input.name)}</h2>`,
    `<p>${escapeHtml(input.painPoint)}</p>`,
    `<p>${escapeHtml(input.solution)}</p>`,
    `<h3>核心卖点</h3>`,
    `<ul>${input.sellingPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`,
    `<h3>规格参数</h3>`,
    `<table>${Object.entries(input.specs)
      .map(
        ([key, value]) =>
          `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`
      )
      .join("")}</table>`,
    `<h3>适用场景</h3>`,
    `<ul>${input.scenarios.map((scenario) => `<li>${escapeHtml(scenario)}</li>`).join("")}</ul>`,
    `<h3>安心购买</h3>`,
    `<ul>${input.trustFactors.map((factor) => `<li>${escapeHtml(factor)}</li>`).join("")}</ul>`,
    input.price > 0
      ? `<p class="price">参考到手价：${escapeHtml(String(input.price))}元起</p>`
      : "",
    `</section>`
  ].join("");
}

function buildMarkdown(input: DescriptionBuildInput): string {
  return [
    `# ${input.name}`,
    "",
    input.painPoint,
    "",
    input.solution,
    "",
    "## 核心卖点",
    ...input.sellingPoints.map((point) => `- ${point}`),
    "",
    "## 规格参数",
    ...Object.entries(input.specs).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## 使用场景",
    ...input.scenarios.map((scenario) => `- ${scenario}`),
    "",
    "## 信任要素",
    ...input.trustFactors.map((factor) => `- ${factor}`)
  ].join("\n");
}

function sanitizeDescription(
  compliance: ComplianceChecker,
  description: ProductDescription
): ProductDescription {
  return {
    ...description,
    painPoint: compliance.sanitize(description.painPoint),
    solution: compliance.sanitize(description.solution),
    sellingPoints: compliance
      .sanitizeList(description.sellingPoints)
      .slice(0, 5),
    scenarios: compliance.sanitizeList(description.scenarios),
    trustFactors: compliance.sanitizeList(description.trustFactors),
    html: compliance.sanitize(description.html),
    markdown: compliance.sanitize(description.markdown)
  };
}

interface DescriptionBuildInput {
  name: string;
  painPoint: string;
  solution: string;
  sellingPoints: string[];
  specs: SpecTable;
  scenarios: string[];
  trustFactors: string[];
  price: number;
}
