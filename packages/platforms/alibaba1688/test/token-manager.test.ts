import { describe, expect, it, vi } from "vitest";
import { TokenManager, type FetchLike } from "../src/token-manager.js";

describe("TokenManager", () => {
  it("refreshes an expired token once when concurrent callers request access", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      return new Response(
        JSON.stringify({
          access_token: "new-access-token",
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

    const manager = new TokenManager({
      appKey: "app-key",
      appSecret: "app-secret",
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_000,
      now: () => 10_000,
      fetchFn
    });

    const [first, second] = await Promise.all([
      manager.getAccessToken(),
      manager.getAccessToken()
    ]);

    expect(first).toBe("new-access-token");
    expect(second).toBe("new-access-token");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
