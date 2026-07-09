import { PddError } from "./errors.js";
import { TokenResponseSchema, type TokenResponse } from "./schemas.js";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PddTokenManagerOptions {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenUrl?: string;
  fetchFn?: FetchLike;
  now?: () => number;
}

export class PddTokenManager {
  private accessToken?: string;
  private refreshTokenValue?: string;
  private expiresAt?: number;
  private refreshPromise?: Promise<string>;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly tokenUrl: string;

  public constructor(private readonly options: PddTokenManagerOptions) {
    this.accessToken = options.accessToken;
    this.refreshTokenValue = options.refreshToken;
    this.expiresAt = options.expiresAt;
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
    this.tokenUrl = options.tokenUrl ?? "https://open-api.pinduoduo.com/oauth/token";
  }

  public async getAccessToken(): Promise<string> {
    if (this.accessToken && !this.isExpired()) {
      return this.accessToken;
    }

    return this.refreshToken();
  }

  public async refreshToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = undefined;
    });

    return this.refreshPromise;
  }

  private isExpired(): boolean {
    if (!this.expiresAt) {
      return false;
    }

    return this.now() >= this.expiresAt - 60_000;
  }

  private async performRefresh(): Promise<string> {
    if (!this.refreshTokenValue) {
      throw new PddError({
        errorCode: "TOKEN_REFRESH_MISSING",
        errorMessage: "Missing refresh_token for PDD token refresh"
      });
    }

    const response = await this.fetchFn(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        grant_type: "refresh_token",
        refresh_token: this.refreshTokenValue
      })
    });

    const data = await readJson(response);

    if (!response.ok) {
      throw new PddError({
        errorCode: `TOKEN_REFRESH_HTTP_${response.status}`,
        errorMessage: "PDD token refresh failed",
        status: response.status,
        cause: data
      });
    }

    const token = parseTokenResponse(data);
    this.accessToken = token.accessToken;
    this.refreshTokenValue = token.refreshToken ?? this.refreshTokenValue;
    this.expiresAt = token.expiresAt ?? this.now() + (token.expiresIn ?? 7200) * 1000;

    return this.accessToken;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new PddError({
      errorCode: "TOKEN_REFRESH_INVALID_JSON",
      errorMessage: "PDD token refresh response is not valid JSON",
      status: response.status,
      cause: error
    });
  }
}

function parseTokenResponse(data: unknown): TokenResponse {
  return TokenResponseSchema.parse(normalizeTokenResponse(data));
}

function normalizeTokenResponse(data: unknown): unknown {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  const raw = data as Record<string, unknown>;

  return {
    accessToken: raw.accessToken ?? raw.access_token,
    refreshToken: raw.refreshToken ?? raw.refresh_token,
    expiresIn: raw.expiresIn ?? raw.expires_in,
    expiresAt: raw.expiresAt ?? raw.expires_at
  };
}
