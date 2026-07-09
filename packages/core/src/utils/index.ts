import { createHash } from "node:crypto";

export function createIdempotencyKey(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }

  return value;
}
