import {
  AggregatedTrendSchema,
  type AggregatedTrend,
  type TrendItem,
  type TrendStorageRecord
} from "./schemas.js";
import {
  DEFAULT_DECAY_AFTER_DAYS,
  DEFAULT_DECAY_PER_DAY,
  DEFAULT_RANK_GROWTH_WEIGHT,
  DEFAULT_RANK_SCORE_WEIGHT
} from "./constants.js";
import type { TrendSource } from "./sources.js";

export interface TrendRepository {
  readHistory(keyword: string, platform: string): Promise<TrendStorageRecord[]>;
  upsertTrends(trends: AggregatedTrend[]): Promise<void>;
}

export interface TrendAggregatorOptions {
  decayAfterDays?: number;
  decayPerDay?: number;
  now?: Date;
}

export class InMemoryTrendRepository implements TrendRepository {
  private readonly records = new Map<string, TrendStorageRecord[]>();

  public async readHistory(
    keyword: string,
    platform: string
  ): Promise<TrendStorageRecord[]> {
    return this.records.get(keyFor(keyword, platform)) ?? [];
  }

  public async upsertTrends(trends: AggregatedTrend[]): Promise<void> {
    for (const trend of trends) {
      const key = keyFor(trend.keyword, trend.platform);
      const history = this.records.get(key) ?? [];
      history.push({ ...trend, decayedScore: trend.score });
      this.records.set(key, history);
    }
  }

  public dump(): TrendStorageRecord[] {
    return [...this.records.values()].flat();
  }
}

export class TrendAggregator {
  private readonly decayAfterDays: number;
  private readonly decayPerDay: number;

  public constructor(
    private readonly repository: TrendRepository = new InMemoryTrendRepository(),
    options: TrendAggregatorOptions = {}
  ) {
    this.decayAfterDays = options.decayAfterDays ?? DEFAULT_DECAY_AFTER_DAYS;
    this.decayPerDay = options.decayPerDay ?? DEFAULT_DECAY_PER_DAY;
  }

  public async collectAndAggregate(
    sources: TrendSource[]
  ): Promise<AggregatedTrend[]> {
    const fetched = await Promise.allSettled(
      sources.map((source) => source.fetchTrends())
    );
    const items = fetched.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
    const trends = await this.aggregate(items);
    await this.repository.upsertTrends(trends);
    return trends;
  }

  public async aggregate(items: TrendItem[]): Promise<AggregatedTrend[]> {
    const grouped = new Map<string, TrendItem[]>();

    for (const item of items) {
      const key = keyFor(item.keyword, item.platform);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }

    const output: AggregatedTrend[] = [];

    for (const group of grouped.values()) {
      const [first] = group;
      if (!first) continue;

      const previous = await this.repository.readHistory(
        first.keyword,
        first.platform
      );
      const observedScore = weightedScore(group);
      const last = previous.at(-1);
      const growthRate = last
        ? (observedScore - last.score) / Math.max(last.score, 1)
        : 0;
      const confidence = Math.min(1, 0.45 + group.length * 0.15);
      const firstSeenAt = previous[0]?.firstSeenAt ?? first.observedAt;
      const lastUpdatedAt = maxDate(group.map((item) => item.observedAt));

      output.push(
        AggregatedTrendSchema.parse({
          ...first,
          score: applyDecay(observedScore, lastUpdatedAt, {
            decayAfterDays: this.decayAfterDays,
            decayPerDay: this.decayPerDay
          }),
          growthRate,
          confidence,
          firstSeenAt,
          lastUpdatedAt
        })
      );
    }

    return output.sort((left, right) => {
      const leftRank =
        left.score * DEFAULT_RANK_SCORE_WEIGHT +
        left.growthRate * 100 * DEFAULT_RANK_GROWTH_WEIGHT;
      const rightRank =
        right.score * DEFAULT_RANK_SCORE_WEIGHT +
        right.growthRate * 100 * DEFAULT_RANK_GROWTH_WEIGHT;
      return rightRank - leftRank;
    });
  }
}

export function applyDecay(
  score: number,
  lastUpdatedAt: Date,
  options: { decayAfterDays: number; decayPerDay: number },
  now = new Date()
): number {
  const ageDays =
    (now.getTime() - lastUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays <= options.decayAfterDays) return score;

  const extraDays = ageDays - options.decayAfterDays;
  return Math.max(0, score * (1 - extraDays * options.decayPerDay));
}

function weightedScore(items: TrendItem[]): number {
  const sourceWeight = new Map([
    ["api", 1],
    ["public", 0.85],
    ["crawl", 0.75],
    ["mock", 0.45]
  ]);
  const totalWeight = items.reduce(
    (total, item) => total + (sourceWeight.get(item.sourceType) ?? 0.5),
    0
  );
  const weighted = items.reduce(
    (total, item) =>
      total + item.score * (sourceWeight.get(item.sourceType) ?? 0.5),
    0
  );
  return Math.round((weighted / Math.max(totalWeight, 1)) * 100) / 100;
}

function maxDate(dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function keyFor(keyword: string, platform: string): string {
  return `${platform}:${keyword.trim().toLowerCase()}`;
}
