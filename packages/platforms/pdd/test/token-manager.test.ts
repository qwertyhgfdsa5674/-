import { describe, expect, it, vi } from "vitest";
import { PddTokenManager, type FetchLike } from "../src/token-manager.js";

describe("PddTokenManager", () => {
  it("refreshes an expired token once for concurrent callers", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      return new Response(
        JSON.stringify({
          access_token: "new-pdd-token",
          refresh_token: "new-refresh-token",
          expires_in: 7200
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });

    const manager = new PddTokenManager({
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      expiresAt: 1000,
      now: () => 10_000,
      fetchFn
    });

    const [first, second] = await Promise.all([
      manager.getAccessToken(),
      manager.getAccessToken()
    ]);

    expect(first).toBe("new-pdd-token");
    expect(second).toBe("new-pdd-token");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
