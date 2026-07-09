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
