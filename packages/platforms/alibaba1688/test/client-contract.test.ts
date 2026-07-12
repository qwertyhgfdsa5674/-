import { describe, expect, it, vi } from "vitest";

import { Alibaba1688Client } from "../src/client.js";
import { Alibaba1688Error } from "../src/errors.js";
import type { FetchLike } from "../src/token-manager.js";

describe("Alibaba1688Client contract", () => {
  it("sends signed form requests and parses search responses", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json({
        success: true,
        result: {
          total: 1,
          items: [
            {
              id: "source-1",
              title: "Portable desk fan",
              priceRange: { min: 28, max: 32 },
              moq: 2,
              image: "https://example.test/fan.jpg",
              sellerId: "seller-1",
            },
          ],
        },
      }),
    );
    const client = createClient(fetchFn);

    const result = await client.searchProducts({
      keyword: "fan",
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: "source-1",
      title: "Portable desk fan",
      sellerId: "seller-1",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://example.test/1688");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/x-www-form-urlencoded",
    });
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("access_token")).toBe("access-token");
    expect(body.get("app_key")).toBe("app-key");
    expect(body.get("method")).toBe("com.alibaba.product.search");
    expect(body.get("keyword")).toBe("fan");
    expect(body.get("page")).toBe("1");
    expect(body.get("pageSize")).toBe("20");
    expect(body.get("sign")).toEqual(expect.any(String));
  });

  it("maps Alibaba error envelopes to Alibaba1688Error", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json({
        success: false,
        errorCode: "InvalidToken",
        errorMessage: "invalid access token",
      }),
    );
    const client = createClient(fetchFn);

    await expect(
      client.searchProducts({ keyword: "fan", page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      name: "Alibaba1688Error",
      errorCode: "InvalidToken",
      message: "invalid access token",
    } satisfies Partial<Alibaba1688Error>);
  });

  it("retries retryable HTTP failures and returns the successful response", async () => {
    const fetchFn = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 500 }))
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          result: {
            orderId: "purchase-1",
            status: "created",
          },
        }),
      );
    const client = createClient(fetchFn);

    vi.useFakeTimers();
    try {
      const resultPromise = client.createOrder({
        productId: "source-1",
        quantity: 2,
        skuSpec: "white",
        receiverName: "Chen",
        receiverPhone: "13800000000",
        receiverAddress: "Shanghai Pudong Sample Road 88",
        idempotencyKey: "order-1-source-1",
      });

      await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(250);

      const result = await resultPromise;

      expect(result).toEqual({
        orderId: "purchase-1",
        status: "created",
      });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

function createClient(fetchFn: FetchLike): Alibaba1688Client {
  return new Alibaba1688Client(
    {
      appKey: "app-key",
      appSecret: "app-secret",
      accessToken: "access-token",
      apiBaseUrl: "https://example.test/1688",
      requestsPerMinute: 100,
    },
    { fetchFn },
  );
}
