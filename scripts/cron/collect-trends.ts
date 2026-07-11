import {
  createDefaultTrendSources,
  TrendAggregator
} from "@ai-ecommerce/data-pipeline";
import {
  fetchJson,
  getEnv,
  logEvent,
  notifyFeishu,
  summarizeEnv
} from "./shared.ts";

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

async function collectPlatformTrends() {
  const aggregator = new TrendAggregator();
  const trends = await aggregator.collectAndAggregate(
    createDefaultTrendSources()
  );

  for (const trend of trends) {
    logEvent({
      event: "trend_collected",
      keyword: trend.keyword,
      platform: trend.platform,
      source: trend.source,
      sourceType: trend.sourceType,
      score: trend.score,
      growthRate: trend.growthRate
    });
  }

  return trends;
}

async function analyzeTrends(
  trends: Awaited<ReturnType<typeof collectPlatformTrends>>
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
