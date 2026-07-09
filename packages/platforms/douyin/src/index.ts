import { z } from "zod";

export const DouyinConfigSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  shopId: z.string().min(1)
});

export type DouyinConfig = z.infer<typeof DouyinConfigSchema>;

export class DouyinClient {
  public constructor(private readonly config: DouyinConfig) {}

  public getConfig(): DouyinConfig {
    return this.config;
  }
}
