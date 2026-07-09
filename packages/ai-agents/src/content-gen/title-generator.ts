import type { ProductDetail } from "@ai-ecommerce/platform-alibaba1688";

import { createCacheKey, InMemoryContentGenerationCache } from "./cache.js";
import { ContentComplianceChecker } from "./compliance.js";
import {
  bestKeywords,
  cleanText,
  minPrice,
  roundRatio,
  sellingPoints,
  unique
} from "./product-utils.js";
import { PromptTemplateManager } from "./prompt-template-manager.js";
import { GeneratedTitleListSchema } from "./schemas.js";
import { DailyTokenBudgetController, estimateTokens } from "./token-budget.js";
import type {
  ContentGenerationDeps,
  GeneratedTitle,
  Platform,
  TitleGenerationOptions,
  TitleStrategy
} from "./types.js";

interface TitleModelOutput {
  titles: GeneratedTitle[];
}

export class TitleGenerator {
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
    hotKeywords: string[],
    options: TitleGenerationOptions = {}
  ): Promise<GeneratedTitle[]> {
    const count = options.count ?? 5;
    const cacheKey = createCacheKey("title", {
      product,
      platform,
      hotKeywords,
      options
    });
    const cached = this.cache.get<GeneratedTitle[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const generated = await this.generateWithProvider(
      product,
      platform,
      hotKeywords,
      {
        ...options,
        count
      }
    );
    const titles = normalizeTitles(
      generated ?? fallbackTitles(product, platform, hotKeywords, count),
      platform,
      hotKeywords,
      count
    ).map((title) => ({
      ...title,
      text: this.compliance.sanitize(limitTitleLength(title.text, platform)),
      keywords: this.compliance.sanitizeList(title.keywords)
    }));

    this.cache.set(cacheKey, titles);
    return titles;
  }

  private async generateWithProvider(
    product: ProductDetail,
    platform: Platform,
    hotKeywords: string[],
    options: Required<Pick<TitleGenerationOptions, "count">> &
      TitleGenerationOptions
  ): Promise<GeneratedTitle[] | undefined> {
    if (!this.deps.aiProvider) {
      return undefined;
    }

    const template = await this.promptManager.loadTemplate(`title-${platform}`);
    const variables = {
      count: options.count,
      keywords: bestKeywords(product, hotKeywords, 8),
      productName: product.title,
      sellingPoints: sellingPoints(product),
      price: minPrice(product),
      tone: options.tone ?? platformDefaultTone(platform)
    };
    const rendered = await this.promptManager.render(template, variables);
    const estimated = estimateTokens(rendered) + options.count * 80;

    this.budget.assertCanSpend(estimated);

    const result = await this.deps.aiProvider.generateJson<TitleModelOutput>({
      provider: template.model.startsWith("gpt") ? "openai" : "anthropic",
      model: template.model,
      temperature: template.temperature,
      system: template.system,
      user: template.user,
      maxOutputTokens: options.count * 120
    });

    this.budget.record(result.usage);

    const parsed = GeneratedTitleListSchema.safeParse(result.data);
    if (!parsed.success) {
      return undefined;
    }

    return parsed.data.titles;
  }
}

function fallbackTitles(
  product: ProductDetail,
  platform: Platform,
  hotKeywords: string[],
  count: number
): GeneratedTitle[] {
  const name = product.title;
  const price = minPrice(product);
  const keywords = bestKeywords(product, hotKeywords, 3);
  const points = sellingPoints(product);
  const templates = platformTemplates(platform, name, price, keywords, points);

  return Array.from({ length: count }, (_value, index) => {
    const template = templates[index % templates.length]!;
    return {
      text: template.text,
      platform,
      strategy: template.strategy,
      keywords: template.keywords,
      estimatedCTR: estimateCtr(
        platform,
        template.strategy,
        template.text,
        template.keywords
      )
    };
  });
}

function platformTemplates(
  platform: Platform,
  name: string,
  price: number,
  keywords: string[],
  points: string[]
): Array<{ text: string; strategy: TitleStrategy; keywords: string[] }> {
  const keywordText = keywords.slice(0, 2).join(" ");
  const point = points[0] ?? "好用又省心";
  const priceText = price > 0 ? `${formatPrice(price)}元起` : "到手好价";

  if (platform === "douyin") {
    return [
      {
        text: `老板疯了！${name}${priceText}真的可以冲`,
        strategy: "urgency",
        keywords
      },
      { text: `${keywordText}突然火了 ${point}`, strategy: "trend", keywords },
      {
        text: `别再乱买了 ${name}这款很能打`,
        strategy: "pain_point",
        keywords
      },
      { text: `${name}${priceText} 限时捡漏`, strategy: "price", keywords },
      { text: `${point}的${name}，闭眼入`, strategy: "quality", keywords }
    ];
  }

  if (platform === "pdd") {
    return [
      { text: `10万+人已买！${name}${priceText}`, strategy: "price", keywords },
      { text: `同款好价 ${keywordText}回购款`, strategy: "price", keywords },
      { text: `${name}工厂直发 多人拼更划算`, strategy: "quality", keywords },
      {
        text: `大家都在买的${keywordText} 到手不心疼`,
        strategy: "trend",
        keywords
      },
      { text: `${point}，家用囤货很合适`, strategy: "pain_point", keywords }
    ];
  }

  return [
    {
      text: `2025新款 ${keywordText} 学生党必备 多色可选`,
      strategy: "trend",
      keywords
    },
    {
      text: `${name} ${keywordText} 通勤家用场景适配`,
      strategy: "quality",
      keywords
    },
    { text: `${keywordText} 搜索热款 ${point}`, strategy: "trend", keywords },
    { text: `${name}${priceText} 高性价比入门款`, strategy: "price", keywords },
    { text: `${point} 送礼自用都合适`, strategy: "pain_point", keywords }
  ];
}

function normalizeTitles(
  titles: GeneratedTitle[],
  platform: Platform,
  hotKeywords: string[],
  count: number
): GeneratedTitle[] {
  const normalized = titles.map((title) => ({
    ...title,
    platform,
    text: cleanText(title.text),
    keywords: unique([...title.keywords, ...hotKeywords]).slice(0, 5),
    estimatedCTR: roundRatio(title.estimatedCTR)
  }));

  return normalized.slice(0, count);
}

function limitTitleLength(text: string, platform: Platform): string {
  const maxLength = platform === "taobao" ? 60 : 30;
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function estimateCtr(
  platform: Platform,
  strategy: TitleStrategy,
  text: string,
  keywords: string[]
): number {
  const base =
    platform === "douyin" ? 0.08 : platform === "pdd" ? 0.065 : 0.055;
  const strategyBonus: Record<TitleStrategy, number> = {
    urgency: 0.025,
    price: 0.03,
    quality: 0.018,
    trend: 0.022,
    pain_point: 0.02
  };
  const keywordBonus = Math.min(keywords.length * 0.006, 0.024);
  const lengthPenalty = text.length > 45 ? 0.012 : 0;

  return roundRatio(
    base + strategyBonus[strategy] + keywordBonus - lengthPenalty
  );
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(1);
}

function platformDefaultTone(platform: Platform): string {
  if (platform === "douyin") {
    return "短促、有冲击力、强情绪";
  }

  if (platform === "pdd") {
    return "价格明确、多人购买、有信任感";
  }

  return "搜索友好、场景清晰、关键词自然";
}
