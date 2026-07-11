import {
  fetchJson,
  getEnv,
  logEvent,
  notifyFeishu,
  summarizeEnv
} from "./shared.ts";

const startedAt = Date.now();
const metrics = await loadMetrics();

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

async function loadMetrics(): Promise<{
  orders: number;
  revenue: number;
  profit: number;
  pendingOrders: number;
  inventoryAlerts: number;
  priceChanges: number;
  reviewIssues: number;
  sourceType: "database" | "mock";
}> {
  const databaseUrl = getEnv("DATABASE_URL");

  if (!databaseUrl) {
    return fallbackMetrics();
  }

  try {
    const postgres = await import("postgres");
    const sql = postgres.default(databaseUrl, { max: 1 });

    try {
      const [orderStats, alertStats, priceStats, reviewStats] =
        await Promise.all([
          sql<{ orders: string; revenue: string; pending_orders: string }[]>`
          select
            count(*)::text as orders,
            coalesce(sum(quantity), 0)::text as revenue,
            count(*) filter (where status in ('pending', 'paid'))::text as pending_orders
          from orders
        `,
          sql<{ inventory_alerts: string }[]>`
          select count(*)::text as inventory_alerts
          from inventory_alerts
          where resolved = false
        `,
          sql<{ price_changes: string }[]>`
          select count(*)::text as price_changes
          from price_history
          where changed_at >= now() - interval '1 day'
        `,
          sql<{ review_issues: string }[]>`
          select count(*)::text as review_issues
          from review_insights
          where sentiment = 'negative'
            and collected_at >= now() - interval '7 days'
        `
        ]);
      const orderRow = orderStats[0];

      return {
        orders: Number(orderRow?.orders ?? 0),
        revenue: Number(orderRow?.revenue ?? 0),
        profit: 0,
        pendingOrders: Number(orderRow?.pending_orders ?? 0),
        inventoryAlerts: Number(alertStats[0]?.inventory_alerts ?? 0),
        priceChanges: Number(priceStats[0]?.price_changes ?? 0),
        reviewIssues: Number(reviewStats[0]?.review_issues ?? 0),
        sourceType: "database"
      };
    } finally {
      await sql.end();
    }
  } catch (error) {
    logEvent({
      event: "daily_report_database_fallback",
      error: error instanceof Error ? error.message : String(error)
    });
    return fallbackMetrics();
  }
}

function fallbackMetrics() {
  return {
    orders: 0,
    revenue: 0,
    profit: 0,
    pendingOrders: 0,
    inventoryAlerts: 0,
    priceChanges: 0,
    reviewIssues: 0,
    sourceType: "mock" as const
  };
}
