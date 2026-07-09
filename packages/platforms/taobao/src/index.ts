import { z } from "zod";

export const TaobaoConfigSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  sessionKey: z.string().optional()
});

export type TaobaoConfig = z.infer<typeof TaobaoConfigSchema>;

export class TaobaoClient {
  public constructor(private readonly config: TaobaoConfig) {}

  public getConfig(): TaobaoConfig {
    return this.config;
  }
}
