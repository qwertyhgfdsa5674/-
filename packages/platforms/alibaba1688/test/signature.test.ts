import { describe, expect, it } from "vitest";
import { SignatureGenerator } from "../src/signature.js";

describe("SignatureGenerator", () => {
  it("sorts params, URL-encodes values, appends secret, and returns uppercase MD5", () => {
    const signature = SignatureGenerator.generate(
      {
        b: "hello world",
        a: "中文",
        timestamp: "2026-07-09 20:00:00",
        sign: "ignored"
      },
      "test-secret"
    );

    expect(signature).toBe("9FC419A37F86699D92AC3B691C0E948E");
  });
});
