import { createHash } from "node:crypto";

export type PddSignMethod = "md5" | "sha256";

export class PddSignatureGenerator {
  public static generate(
    params: Record<string, unknown>,
    clientSecret: string,
    signMethod: PddSignMethod = "md5"
  ): string {
    const payload =
      clientSecret +
      Object.keys(params)
        .filter((key) => key !== "sign" && params[key] !== undefined && params[key] !== null)
        .sort()
        .map((key) => `${key}${PddSignatureGenerator.stringify(params[key])}`)
        .join("") +
      clientSecret;

    return createHash(signMethod).update(payload).digest("hex").toUpperCase();
  }

  private static stringify(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }

    return JSON.stringify(value);
  }
}
