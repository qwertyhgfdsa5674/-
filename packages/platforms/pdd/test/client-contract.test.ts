import { describe, expect, it, vi } from "vitest";

import { PddClient } from "../src/client.js";
import type { PddError } from "../src/errors.js";
import type { FetchLike } from "../src/token-manager.js";

describe("PddClient contract", () => {
  it("sends signed JSON requests and parses goods list responses", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json({
        pdd_goods_list_get_response: {
          total: 1,
          items: [
            {
              goodsId: "goods-1",
              goodsName: "Portable desk fan",
              price: 69,
              quantity: 12,
              isOnsale: true,
            },
          ],
        },
      }),
    );
    const client = createClient(fetchFn);

    const result = await client.getGoodsList({ page: 1, pageSize: 20 });

    expect(result).toEqual({
      total: 1,
      items: [
        {
          goodsId: "goods-1",
          goodsName: "Portable desk fan",
          price: 69,
          quantity: 12,
          isOnsale: true,
        },
      ],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://example.test/pdd");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      access_token: "access-token",
      client_id: "client-id",
      data_type: "JSON",
      sign_method: "md5",
      type: "pdd.goods.list.get",
      page: 1,
      pageSize: 20,
    });
    expect(body["sign"]).toEqual(expect.any(String));
  });

  it("maps PDD error envelopes to PddError", async () => {
    const fetchFn = vi.fn<FetchLike>(async () =>
      Response.json(
        {
          error_response: {
            error_code: 10019,
            error_msg: "invalid access token",
          },
        },
        { status: 200 },
      ),
    );
    const client = createClient(fetchFn);

    await expect(
      client.getGoodsList({ page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      name: "PddError",
      errorCode: "10019",
      errorMessage: "invalid access token",
      message: "invalid access token",
    } satisfies Partial<PddError>);
  });

  it("retries retryable HTTP failures and stops after success", async () => {
    vi.useFakeTimers();

    try {
      const fetchFn = vi
        .fn<FetchLike>()
        .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
        .mockResolvedValueOnce(
          jsonResponse({
            pdd_order_list_get_response: {
              total: 0,
              items: [],
            },
          }),
        );
      const client = createClient(fetchFn);

      const request = client.getOrderList({
        startUpdatedAt: "2026-07-12 00:00:00",
        endUpdatedAt: "2026-07-12 23:59:59",
        page: 1,
        pageSize: 10,
      });

      await waitForRetryTimer();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(250);
      const result = await request;

      expect(result).toEqual({ total: 0, items: [] });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

async function waitForRetryTimer(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.resolve();

    if (vi.getTimerCount() > 0) {
      return;
    }
  }

  expect(vi.getTimerCount()).toBeGreaterThan(0);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function createClient(fetchFn: FetchLike): PddClient {
  return new PddClient(
    {
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "access-token",
      apiBaseUrl: "https://example.test/pdd",
      requestsPerSecond: 100,
    },
    { fetchFn },
  );
}
