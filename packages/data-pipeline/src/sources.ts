import { TrendItemSchema, type TrendItem } from "./schemas.js";

export interface TrendSource {
  readonly sourceName: string;
  fetchTrends(): Promise<TrendItem[]>;
}

export interface FetchJsonOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export class MockTrendSource implements TrendSource {
  public constructor(
    public readonly sourceName: string,
    private readonly platform: string,
    private readonly keywords: string[],
    private readonly sourceType: "api" | "crawl" | "public" | "mock" = "mock"
  ) {}

  public async fetchTrends(): Promise<TrendItem[]> {
    return this.keywords.map((keyword, index) =>
      TrendItemSchema.parse({
        keyword,
        platform: this.platform,
        source: this.sourceName,
        sourceType: this.sourceType,
        score: Math.max(35, 100 - index * 8),
        category: inferCategory(keyword),
        metadata: { rank: index + 1 }
      })
    );
  }
}

export class JsonTrendSource implements TrendSource {
  public constructor(
    public readonly sourceName: string,
    private readonly url: string,
    private readonly platform: string,
    private readonly options: FetchJsonOptions = {}
  ) {}

  public async fetchTrends(): Promise<TrendItem[]> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 15_000
    );

    try {
      const response = await fetchFn(this.url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`${this.sourceName} failed with ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      const rawItems = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { data?: unknown }).data)
          ? (payload as { data: unknown[] }).data
          : [];

      return rawItems.map((item) =>
        TrendItemSchema.parse({
          ...(item as Record<string, unknown>),
          platform: (item as { platform?: string }).platform ?? this.platform,
          source: this.sourceName,
          sourceType: "api"
        })
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createDefaultTrendSources(): TrendSource[] {
  return [
    new MockTrendSource("baidu-index-public", "baidu", [
      "summer sunscreen",
      "mini fan",
      "storage box",
      "commuter backpack"
    ]),
    new MockTrendSource("wechat-index-public", "wechat", [
      "618 promotion",
      "back to school",
      "humidifier",
      "thermal underwear"
    ]),
    new MockTrendSource("platform-suggest-douyin", "douyin", [
      "video friendly home gadget",
      "desk setup",
      "lazy home",
      "portable blender"
    ]),
    new MockTrendSource("platform-suggest-pdd", "pdd", [
      "family essential",
      "low price tissue",
      "dorm essentials",
      "storage tool"
    ]),
    new MockTrendSource("competitor-monitor", "competitor", [
      "new arrival 2026",
      "price drop",
      "white background product",
      "fast shipping"
    ])
  ];
}

function inferCategory(keyword: string): string {
  const lower = keyword.toLowerCase();
  if (lower.includes("school") || lower.includes("dorm")) return "education";
  if (lower.includes("fan") || lower.includes("sunscreen")) return "summer";
  if (lower.includes("humidifier") || lower.includes("thermal"))
    return "winter";
  if (lower.includes("storage") || lower.includes("home")) return "home";
  return "general";
}
