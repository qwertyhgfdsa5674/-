import {
  fetchJson,
  getEnv,
  logEvent,
  notifyFeishu,
  summarizeEnv
} from "./shared.ts";

const startedAt = Date.now();
const metrics = {
  orders: 0,
  revenue: 0,
  profit: 0,
  pendingOrders: 0,
  inventoryAlerts: 0
};

logEvent({
  event: "daily_report_started",
  credentials: summarizeEnv(["DATABASE_URL", "OPENAI_API_KEY"])
});

const insight = await generateInsight(metrics);

logEvent({
  event: "daily_report_completed",
  metrics,
  durationMs: Date.now() - startedAt
});

await notifyFeishu("Daily operations report", [
  `Orders: ${metrics.orders}`,
  `Revenue: ${metrics.revenue}`,
  `Profit: ${metrics.profit}`,
  `Pending orders: ${metrics.pendingOrders}`,
  `Inventory alerts: ${metrics.inventoryAlerts}`,
  `AI insight: ${insight}`
]);

async function generateInsight(input: typeof metrics): Promise<string> {
  const apiKey = getEnv("OPENAI_API_KEY");

  if (!apiKey) {
    return "OpenAI credentials are missing; generated a basic operations report.";
  }

  try {
    const result = await fetchJson<{
      choices?: Array<{ message?: { content?: string } }>;
    }>("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: getEnv("OPENAI_MODEL") ?? "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Summarize these ecommerce operations metrics and suggest one action for tomorrow: ${JSON.stringify(input)}`
          }
        ],
        temperature: 0.3
      })
    });

    return (
      result.choices?.[0]?.message?.content?.trim() ??
      "Metrics summarized; prioritize pending fulfillment work."
    );
  } catch (error) {
    logEvent({
      event: "daily_report_ai_failed",
      error: error instanceof Error ? error.message : String(error)
    });
    return "AI insight is unavailable; prioritize fulfillment and inventory alerts.";
  }
}
