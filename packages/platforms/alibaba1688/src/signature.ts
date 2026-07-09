import { createHash } from "node:crypto";

export class SignatureGenerator {
  public static generate(
    params: Record<string, unknown>,
    appSecret: string
  ): string {
    const signingPayload = Object.keys(params)
      .filter(
        (key) =>
          key !== "sign" && params[key] !== undefined && params[key] !== null
      )
      .sort()
      .map(
        (key) =>
          `${key}=${encodeURIComponent(SignatureGenerator.stringify(params[key]))}`
      )
      .join("&");

    return createHash("md5")
      .update(`${signingPayload}&secret=${appSecret}`)
      .digest("hex")
      .toUpperCase();
  }

  private static stringify(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value);
    }

    return JSON.stringify(value);
  }
}
