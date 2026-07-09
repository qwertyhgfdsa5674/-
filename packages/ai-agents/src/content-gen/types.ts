import type { ProductDetail } from "@ai-ecommerce/platform-alibaba1688";

export type Platform = "douyin" | "pdd" | "taobao";

export type TitleStrategy =
  "urgency" | "price" | "quality" | "trend" | "pain_point";

export interface GeneratedTitle {
  text: string;
  platform: string;
  strategy: TitleStrategy;
  keywords: string[];
  estimatedCTR: number;
}

export type SpecTable = Record<string, string>;

export interface ProductDescription {
  painPoint: string;
  solution: string;
  sellingPoints: string[];
  specs: SpecTable;
  scenarios: string[];
  trustFactors: string[];
  html: string;
  markdown: string;
}

export interface ImageCaption {
  overlayText: string;
  position: "top" | "center" | "bottom";
  style: "price_tag" | "feature_badge" | "urgency_banner";
  color: string;
}

export interface PromptTemplate {
  name: string;
  model: string;
  temperature: number;
  system: string;
  user: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenBudget {
  maxTokensPerRequest?: number;
  maxTokensPerDay?: number;
}

export interface AiGenerationRequest {
  provider: "openai" | "anthropic";
  model: string;
  temperature: number;
  system: string;
  user: string;
  maxOutputTokens?: number;
}

export interface AiGenerationResult<T> {
  data: T;
  usage?: Partial<TokenUsage>;
}

export interface ContentAiProvider {
  generateJson<T>(request: AiGenerationRequest): Promise<AiGenerationResult<T>>;
}

export interface ContentGenerationDeps {
  aiProvider?: ContentAiProvider;
  cache?: ContentGenerationCache;
  compliance?: ComplianceChecker;
  budget?: TokenBudgetController;
  promptManager?: PromptTemplateManagerLike;
  preferredProvider?: "openai" | "anthropic";
}

export interface ContentGenerationCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
}

export interface ComplianceChecker {
  sanitize(text: string): string;
  sanitizeList(values: string[]): string[];
}

export interface TokenBudgetController {
  assertCanSpend(estimatedTokens: number): void;
  record(usage: Partial<TokenUsage> | undefined): void;
  getUsage(): TokenUsage;
}

export interface PromptTemplateManagerLike {
  loadTemplate(name: string): Promise<PromptTemplate>;
  render(
    template: PromptTemplate,
    variables: Record<string, unknown>
  ): Promise<string>;
}

export interface TitleGenerationOptions {
  count?: number;
  tone?: string;
}

export type ProductContentContext = ProductDetail;
