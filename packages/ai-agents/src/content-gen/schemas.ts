import { z } from "zod";

export const PlatformSchema = z.enum(["douyin", "pdd", "taobao"]);

export const GeneratedTitleSchema = z.object({
  text: z.string().min(1),
  platform: PlatformSchema,
  strategy: z.enum(["urgency", "price", "quality", "trend", "pain_point"]),
  keywords: z.array(z.string()),
  estimatedCTR: z.number().min(0).max(1)
});

export const GeneratedTitleListSchema = z.object({
  titles: z.array(GeneratedTitleSchema)
});

export const ProductDescriptionSchema = z.object({
  painPoint: z.string().min(1),
  solution: z.string().min(1),
  sellingPoints: z.array(z.string()).min(3).max(5),
  specs: z.record(z.string()),
  scenarios: z.array(z.string()),
  trustFactors: z.array(z.string()),
  html: z.string().min(1),
  markdown: z.string().min(1)
});

export const ImageCaptionSchema = z.object({
  overlayText: z.string().min(1),
  position: z.enum(["top", "center", "bottom"]),
  style: z.enum(["price_tag", "feature_badge", "urgency_banner"]),
  color: z.string().min(1)
});
