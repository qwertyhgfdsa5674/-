import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, clearApiToken, getJson, setApiToken } from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  clearApiToken();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("API client authentication", () => {
  it("sends a bearer token when API auth state is configured", async () => {
    setApiToken("secret");
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await getJson("/api/dashboard");

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard", {
      headers: {
        Authorization: "Bearer secret",
      },
    });
  });

  it("omits authorization when no API auth state is configured", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await getJson("/health");

    expect(fetchMock).toHaveBeenCalledWith("/health");
  });

  it("sends a bearer token from localStorage when API auth state is stored", async () => {
    window.localStorage.setItem("ai-ecommerce.apiToken", "stored-secret");
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await getJson("/api/products");

    expect(fetchMock).toHaveBeenCalledWith("/api/products", {
      headers: {
        Authorization: "Bearer stored-secret",
      },
    });
  });

  it("rejects non-2xx responses with API request details", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const request = getJson("/api/dashboard");

    await expect(request).rejects.toMatchObject({
      status: 401,
      body: {
        error: "Unauthorized",
      },
    });
    await expect(request).rejects.toBeInstanceOf(ApiRequestError);
  });
});
