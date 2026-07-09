export interface CronEvent {
  event: string;
  at?: string;
  [key: string]: unknown;
}

export function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function hasEnv(...names: string[]): boolean {
  return names.every((name) => Boolean(getEnv(name)));
}

export function logEvent(event: CronEvent): void {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      ...event
    })
  );
}

export async function notifyFeishu(
  title: string,
  lines: string[]
): Promise<void> {
  const webhookUrl = getEnv("FEISHU_WEBHOOK_URL");

  if (!webhookUrl) {
    logEvent({
      event: "feishu_notification_skipped",
      reason: "missing_webhook",
      title
    });
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: [title, ...lines].filter(Boolean).join("\n")
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Feishu webhook failed with status ${response.status}`);
  }

  logEvent({ event: "feishu_notification_sent", title });
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function summarizeEnv(names: string[]): Record<string, boolean> {
  return Object.fromEntries(names.map((name) => [name, Boolean(getEnv(name))]));
}
