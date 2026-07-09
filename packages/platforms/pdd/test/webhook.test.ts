import { describe, expect, it } from "vitest";
import { PddSignatureGenerator } from "../src/signature.js";
import { verifyPddWebhookSignature } from "../src/webhook.js";

describe("verifyPddWebhookSignature", () => {
  it("accepts a valid webhook signature", () => {
    const params = {
      type: "pdd.order.status.notify",
      order_sn: "ORDER-1",
      timestamp: 1783612000
    };
    const signature = PddSignatureGenerator.generate(params, "secret-1");

    expect(
      verifyPddWebhookSignature({
        params,
        clientSecret: "secret-1",
        signature
      })
    ).toBe(true);
  });

  it("rejects an invalid webhook signature", () => {
    expect(
      verifyPddWebhookSignature({
        params: {
          type: "pdd.order.status.notify",
          order_sn: "ORDER-1",
          timestamp: 1783612000
        },
        clientSecret: "secret-1",
        signature: "00000000000000000000000000000000"
      })
    ).toBe(false);
  });
});
