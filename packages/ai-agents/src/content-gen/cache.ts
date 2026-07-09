import { createHash } from "crypto";

import type { ContentGenerationCache } from "./types.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class InMemoryContentGenerationCache implements ContentGenerationCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  public get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }
}

export function createCacheKey(scope: string, input: unknown): string {
  return `${scope}:${createHash("sha256").update(stableStringify(input)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
