import { describe, expect, it } from "vitest";
import { PddSignatureGenerator } from "../src/signature.js";

describe("PddSignatureGenerator", () => {
  it("generates an uppercase MD5 signature from sorted params", () => {
    const signature = PddSignatureGenerator.generate(
      {
        type: "pdd.goods.add",
        client_id: "client-1",
        timestamp: 1783612000,
        data_type: "JSON",
        sign: "ignored"
      },
      "secret-1"
    );

    expect(signature).toBe("3E0746FB0D89BDE0A4CE09593C44D353");
  });

  it("supports SHA256 signatures", () => {
    const signature = PddSignatureGenerator.generate(
      {
        type: "pdd.goods.add",
        client_id: "client-1",
        timestamp: 1783612000,
        data_type: "JSON"
      },
      "secret-1",
      "sha256"
    );

    expect(signature).toBe(
      "FE22669F4A2EE885429DD13D17758A07F19C987B19221326CE913AF109C45DD6"
    );
  });
});
