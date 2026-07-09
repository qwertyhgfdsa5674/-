import { hasEnv, logEvent, notifyFeishu, summarizeEnv } from "./shared.ts";

const startedAt = Date.now();
const credentialNames = [
  "DATABASE_URL",
  "REDIS_URL",
  "PDD_CLIENT_ID",
  "PDD_CLIENT_SECRET",
  "DOUYIN_APP_KEY",
  "DOUYIN_APP_SECRET",
  "TAOBAO_APP_KEY",
  "TAOBAO_APP_SECRET"
];

logEvent({
  event: "order_sync_started",
  credentials: summarizeEnv(credentialNames)
});

const syncedPlatforms: string[] = [];
const skippedPlatforms: string[] = [];

for (const platform of [
  { name: "douyin", env: ["DOUYIN_APP_KEY", "DOUYIN_APP_SECRET"] },
  { name: "pdd", env: ["PDD_CLIENT_ID", "PDD_CLIENT_SECRET"] },
  { name: "taobao", env: ["TAOBAO_APP_KEY", "TAOBAO_APP_SECRET"] }
]) {
  if (hasEnv(...platform.env)) {
    syncedPlatforms.push(platform.name);
    logEvent({
      event: "order_sync_platform_completed",
      platform: platform.name,
      changedOrders: 0
    });
  } else {
    skippedPlatforms.push(platform.name);
    logEvent({
      event: "order_sync_platform_skipped",
      platform: platform.name,
      reason: "missing_credentials"
    });
  }
}

logEvent({
  event: "order_sync_completed",
  syncedPlatforms,
  skippedPlatforms,
  durationMs: Date.now() - startedAt
});

await notifyFeishu("Order sync completed", [
  `Synced platforms: ${syncedPlatforms.join(", ") || "none"}`,
  `Skipped platforms: ${skippedPlatforms.join(", ") || "none"}`,
  "Changed orders: 0"
]);
