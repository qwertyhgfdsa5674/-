import { chromium, type BrowserContextOptions } from "playwright";
import { z } from "zod";

export const BrowserTaskSchema = z.object({
  name: z.string().min(1),
  startUrl: z.string().url(),
  trace: z.boolean().default(false)
});

export type BrowserTask = z.infer<typeof BrowserTaskSchema>;

export async function runBrowserTask(
  task: BrowserTask,
  options: BrowserContextOptions = {}
): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext(options);
  const page = await context.newPage();

  try {
    await page.goto(task.startUrl, { waitUntil: "domcontentloaded" });
    return await page.title();
  } finally {
    await context.close();
    await browser.close();
  }
}

export interface PlatformLoginTask {
  platform: string;
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
}

export interface RpaListingTask {
  platform: string;
  listingUrl: string;
  fields: Record<string, string>;
  submitSelector: string;
}

export async function runLoginTask(
  task: PlatformLoginTask,
  credentials: { username: string; password: string },
  options: BrowserContextOptions = {}
): Promise<{ platform: string; title: string }> {
  const browser = await chromium.launch();
  const context = await browser.newContext(options);
  const page = await context.newPage();

  try {
    await page.goto(task.loginUrl, { waitUntil: "domcontentloaded" });
    await page.fill(task.usernameSelector, credentials.username);
    await page.fill(task.passwordSelector, credentials.password);
    await page.click(task.submitSelector);
    await page.waitForLoadState("networkidle");
    return { platform: task.platform, title: await page.title() };
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function runListingFallback(
  task: RpaListingTask,
  options: BrowserContextOptions = {}
): Promise<{ platform: string; submitted: boolean }> {
  const browser = await chromium.launch();
  const context = await browser.newContext(options);
  const page = await context.newPage();

  try {
    await page.goto(task.listingUrl, { waitUntil: "domcontentloaded" });
    for (const [selector, value] of Object.entries(task.fields)) {
      await page.fill(selector, value);
    }
    await page.click(task.submitSelector);
    return { platform: task.platform, submitted: true };
  } finally {
    await context.close();
    await browser.close();
  }
}
