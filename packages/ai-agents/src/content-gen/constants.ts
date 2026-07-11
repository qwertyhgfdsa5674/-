import type { Platform } from "./types.js";

export const TITLE_MAX_LENGTH: Record<Platform, number> = {
  douyin: 30,
  pdd: 30,
  taobao: 60,
};

export const CTR_BASE: Record<Platform, number> = {
  douyin: 0.08,
  pdd: 0.065,
  taobao: 0.055,
};

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const TOKEN_ESTIMATE_RATIO = 0.5;

export const DESCRIPTIONS_DEFAULT_MAX_OUTPUT_TOKENS = 1600;

export const IMAGE_CAPTION_DEFAULT_MAX_TOKENS = 300;
