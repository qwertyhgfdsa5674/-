import {
  fetchJson,
  getEnv,
  hasEnv,
  logEvent,
  notifyFeishu,
  summarizeEnv
} from "./shared.ts";

interface TrendItem {
  platform: "douyin" | "pdd" | "taobao";
  keyword: string;
  score: number;
  category: string;
}

const startedAt = new Date();
const credentialNames = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PDD_CLIENT_ID",
  "PDD_CLIENT_SECRET",
  "DOUYIN_APP_KEY",
  "DOUYIN_APP_SECRET",
  "TAOBAO_APP_KEY",
  "TAOBAO_APP_SECRET"
];

logEvent({
  event: "trend_collection_started",
  credentials: summarizeEnv(credentialNames)
});

const trends = await collectPlatformTrends();
const analysis = await analyzeTrends(trends);

logEvent({
  event: "trend_collection_completed",
  count: trends.length,
  analysisProvider: analysis.provider,
  durationMs: Date.now() - startedAt.getTime()
});

await notifyFeishu("Trend collection completed", [
  `Collected keywords: ${trends.length}`,
  `Analysis provider: ${analysis.provider}`,
  `Summary: ${analysis.summary}`,
  `Top keywords: ${trends
    .slice(0, 8)
    .map((item) => `${item.keyword}(${item.platform})`)
    .join(", ")}`
]);

async function collectPlatformTrends(): Promise<TrendItem[]> {
  const platformSignals: TrendItem[] = [];

  if (hasEnv("DOUYIN_APP_KEY", "DOUYIN_APP_SECRET")) {
    platformSignals.push(
      ...mockPlatformTrends("douyin", [
        "short_video_hit",
        "summer_sunscreen",
        "storage_tool"
      ])
    );
  } else {
    logEvent({
      event: "trend_platform_skipped",
      platform: "douyin",
      reason: "missing_credentials"
    });
  }

  if (hasEnv("PDD_CLIENT_ID", "PDD_CLIENT_SECRET")) {
    platformSignals.push(
      ...mockPlatformTrends("pdd", [
        "low_price_tissue",
        "home_appliance",
        "dorm_essentials"
      ])
    );
  } else {
    logEvent({
      event: "trend_platform_skipped",
      platform: "pdd",
      reason: "missing_credentials"
    });
  }

  if (hasEnv("TAOBAO_APP_KEY", "TAOBAO_APP_SECRET")) {
    platformSignals.push(
      ...mockPlatformTrends("taobao", [
        "new_arrival_2026",
        "desk_setup",
        "commuter_bag"
      ])
    );
  } else {
    logEvent({
      event: "trend_platform_skipped",
      platform: "taobao",
      reason: "missing_credentials"
    });
  }

  return platformSignals.length > 0 ? platformSignals : mockFallbackTrends();
}

function mockPlatformTrends(
  platform: TrendItem["platform"],
  keywords: string[]
): TrendItem[] {
  return keywords.map((keyword, index) => ({
    platform,
    keyword,
    score: 100 - index * 8,
    category: index % 2 === 0 ? "daily_goods" : "fashion_accessories"
  }));
}

function mockFallbackTrends(): TrendItem[] {
  return [
    ...mockPlatformTrends("douyin", ["video_friendly_product", "lazy_home"]),
    ...mockPlatformTrends("pdd", ["repeat_purchase_value", "family_essential"]),
    ...mockPlatformTrends("taobao", ["search_growth", "scenario_outfit"])
  ];
}

async function analyzeTrends(
  trends: TrendItem[]
): Promise<{ provider: string; summary: string }> {
  const prompt = `Summarize these ecommerce trend keywords in one short Chinese sentence: ${JSON.stringify(trends)}`;
  const openAiKey = getEnv("OPENAI_API_KEY");

  if (openAiKey) {
    try {
      const result = await fetchJson<{
        choices?: Array<{ message?: { content?: string } }>;
      }>("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${openAiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: getEnv("OPENAI_MODEL") ?? "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4
        })
      });

      return {
        provider: "openai",
        summary:
          result.choices?.[0]?.message?.content?.trim() ?? fallbackSummary()
      };
    } catch (error) {
      logEvent({
        event: "trend_ai_analysis_failed",
        provider: "openai",
        error: errorMessage(error)
      });
    }
  }

  const anthropicKey = getEnv("ANTHROPIC_API_KEY");

  if (anthropicKey) {
    try {
      const result = await fetchJson<{ content?: Array<{ text?: string }> }>(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: getEnv("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-latest",
            max_tokens: 300,
            messages: [{ role: "user", content: prompt }]
          })
        }
      );

      return {
        provider: "anthropic",
        summary: result.content?.[0]?.text?.trim() ?? fallbackSummary()
      };
    } catch (error) {
      logEvent({
        event: "trend_ai_analysis_failed",
        provider: "anthropic",
        error: errorMessage(error)
      });
    }
  }

  return {
    provider: "local-fallback",
    summary: fallbackSummary()
  };
}

function fallbackSummary(): string {
  return "Demand is concentrated in low-price essentials, seasonal scenarios, and video-friendly home products.";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
