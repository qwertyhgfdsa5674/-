import { z } from "zod";

export const TrendSourceTypeSchema = z.enum(["api", "crawl", "public", "mock"]);
export type TrendSourceType = z.infer<typeof TrendSourceTypeSchema>;

export const TrendItemSchema = z.object({
  keyword: z.string().min(1).max(200),
  platform: z.string().min(1).max(32),
  score: z.number().min(0).max(100),
  source: z.string().min(1).max(64),
  sourceType: TrendSourceTypeSchema,
  category: z.string().min(1).max(100).optional(),
  observedAt: z.coerce.date().default(() => new Date()),
  metadata: z.record(z.unknown()).default({})
});
export type TrendItem = z.infer<typeof TrendItemSchema>;

export const AggregatedTrendSchema = TrendItemSchema.extend({
  growthRate: z.number(),
  confidence: z.number().min(0).max(1),
  firstSeenAt: z.coerce.date(),
  lastUpdatedAt: z.coerce.date()
});
export type AggregatedTrend = z.infer<typeof AggregatedTrendSchema>;

export const EventCalendarEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  eventType: z.enum(["promotion", "seasonal", "platform", "holiday"]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  leadDays: z.number().int().nonnegative().default(14),
  affectedCategories: z.array(z.string()).default([]),
  priority: z.number().int().min(0).max(100).default(50),
  notes: z.string().optional()
});
export type EventCalendarEntry = z.infer<typeof EventCalendarEntrySchema>;

export const TrendStorageRecordSchema = AggregatedTrendSchema.extend({
  decayedScore: z.number().min(0).max(100)
});
export type TrendStorageRecord = z.infer<typeof TrendStorageRecordSchema>;
