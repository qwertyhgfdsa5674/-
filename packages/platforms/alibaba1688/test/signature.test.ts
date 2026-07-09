import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SignatureGenerator } from "../src/signature.js";

describe("SignatureGenerator", () => {
  it("sorts params, URL-encodes values, appends secret, and returns uppercase MD5", () => {
    const params = {
      b: "hello world",
      a: "sample",
      timestamp: "2026-07-09 20:00:00",
      sign: "ignored"
    };

    expect(SignatureGenerator.generate(params, "test-secret")).toBe(
      referenceSignature(params, "test-secret")
    );
  });

  it("returns a stable signature for the same parameter values", () => {
    const params = {
      appKey: "app-key",
      keyword: "phone case",
      page: 1,
      pageSize: 20
    };

    expect(SignatureGenerator.generate(params, "secret")).toBe(
      SignatureGenerator.generate(params, "secret")
    );
  });

  it("URL-encodes reserved characters in parameter values", () => {
    const params = {
      keyword: "a&b=c%20",
      timestamp: "2026-07-09 20:00:00"
    };

    expect(referencePayload(params, "secret")).toBe(
      "keyword=a%26b%3Dc%2520&timestamp=2026-07-09%2020%3A00%3A00&secret=secret"
    );
    expect(SignatureGenerator.generate(params, "secret")).toBe(
      referenceSignature(params, "secret")
    );
  });

  it("filters undefined and null parameters from the signature", () => {
    const paramsWithEmptyValues = {
      a: "kept",
      b: undefined,
      c: null
    };
    const paramsWithoutEmptyValues = {
      a: "kept"
    };

    expect(SignatureGenerator.generate(paramsWithEmptyValues, "secret")).toBe(
      SignatureGenerator.generate(paramsWithoutEmptyValues, "secret")
    );
    expect(referencePayload(paramsWithEmptyValues, "secret")).toBe(
      "a=kept&secret=secret"
    );
  });

  it("excludes only the sign parameter and keeps other parameters", () => {
    const params = {
      sign: "ignored",
      signedValue: "kept",
      keyword: "cup"
    };

    expect(referencePayload(params, "secret")).toBe(
      "keyword=cup&signedValue=kept&secret=secret"
    );
    expect(SignatureGenerator.generate(params, "secret")).toBe(
      referenceSignature({ keyword: "cup", signedValue: "kept" }, "secret")
    );
  });

  it("does not depend on the insertion order of parameters", () => {
    const orderedParams = {
      a: "1",
      b: "2",
      c: "3"
    };
    const shuffledParams = {
      c: "3",
      a: "1",
      b: "2"
    };

    expect(SignatureGenerator.generate(orderedParams, "secret")).toBe(
      SignatureGenerator.generate(shuffledParams, "secret")
    );
  });

  it("uses the &secret={appSecret} suffix when building the signing payload", () => {
    expect(referencePayload({ a: "1" }, "app-secret")).toBe(
      "a=1&secret=app-secret"
    );
    expect(SignatureGenerator.generate({ a: "1" }, "app-secret")).toBe(
      createHash("md5")
        .update("a=1&secret=app-secret")
        .digest("hex")
        .toUpperCase()
    );
  });
});

function referencePayload(
  params: Record<string, unknown>,
  appSecret: string
): string {
  const signingPayload = Object.keys(params)
    .filter(
      (key) =>
        key !== "sign" && params[key] !== undefined && params[key] !== null
    )
    .sort()
    .map((key) => `${key}=${encodeURIComponent(String(params[key]))}`)
    .join("&");

  return `${signingPayload}&secret=${appSecret}`;
}

function referenceSignature(
  params: Record<string, unknown>,
  appSecret: string
): string {
  return createHash("md5")
    .update(referencePayload(params, appSecret))
    .digest("hex")
    .toUpperCase();
}
