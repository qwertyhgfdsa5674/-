import {
  getEnv,
  hasEnv,
  logEvent,
  notifyFeishu,
  summarizeEnv
} from "./shared.ts";

const startedAt = Date.now();
const threshold = Number(getEnv("PRICE_ALERT_THRESHOLD") ?? "0.08");
const credentialNames = [
  "DATABASE_URL",
  "ALIBABA_APP_KEY",
  "ALIBABA_APP_SECRET",
  "ALIBABA_ACCESS_TOKEN"
];

logEvent({
  event: "price_inventory_check_started",
  threshold,
  credentials: summarizeEnv(credentialNames)
});

if (!hasEnv("ALIBABA_APP_KEY", "ALIBABA_APP_SECRET", "ALIBABA_ACCESS_TOKEN")) {
  logEvent({
    event: "price_inventory_check_skipped",
    reason: "missing_alibaba_credentials"
  });
  await notifyFeishu("1688 price inventory check skipped", [
    "Reason: missing Alibaba 1688 API credentials",
    `Alert threshold: ${threshold}`
  ]);
  process.exit(0);
}

const alerts: Array<{ productId: string; reason: string; change: number }> = [];

logEvent({
  event: "price_inventory_check_completed",
  checkedProducts: 0,
  alerts: alerts.length,
  durationMs: Date.now() - startedAt
});

await notifyFeishu("1688 price inventory check completed", [
  "Checked products: 0",
  `Alerts: ${alerts.length}`,
  `Price threshold: ${threshold}`
]);
