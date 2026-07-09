import type {
  TokenBudget,
  TokenBudgetController,
  TokenUsage
} from "./types.js";

export class DailyTokenBudgetController implements TokenBudgetController {
  private usage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };

  public constructor(private readonly budget: TokenBudget = {}) {}

  public assertCanSpend(estimatedTokens: number): void {
    if (
      this.budget.maxTokensPerRequest !== undefined &&
      estimatedTokens > this.budget.maxTokensPerRequest
    ) {
      throw new Error(
        `Token request budget exceeded. Estimated ${estimatedTokens}, limit ${this.budget.maxTokensPerRequest}.`
      );
    }

    if (
      this.budget.maxTokensPerDay !== undefined &&
      this.usage.totalTokens + estimatedTokens > this.budget.maxTokensPerDay
    ) {
      throw new Error(
        `Daily token budget exceeded. Estimated ${estimatedTokens}, remaining ${Math.max(
          this.budget.maxTokensPerDay - this.usage.totalTokens,
          0
        )}.`
      );
    }
  }

  public record(usage: Partial<TokenUsage> | undefined): void {
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;

    this.usage = {
      promptTokens: this.usage.promptTokens + promptTokens,
      completionTokens: this.usage.completionTokens + completionTokens,
      totalTokens: this.usage.totalTokens + totalTokens
    };
  }

  public getUsage(): TokenUsage {
    return { ...this.usage };
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}
