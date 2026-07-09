import { Alibaba1688Error } from "./errors.js";
import { SignatureGenerator } from "./signature.js";
import { TokenResponseSchema, type TokenResponse } from "./schemas.js";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export interface TokenManagerOptions {
  appKey: string;
  appSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenUrl?: string;
  fetchFn?: FetchLike;
  now?: () => number;
}

export class TokenManager {
  private accessToken?: string;
  private refreshTokenValue?: string;
  private expiresAt?: number;
  private refreshPromise?: Promise<string>;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly tokenUrl: string;

  public constructor(private readonly options: TokenManagerOptions) {
    this.accessToken = options.accessToken;
    this.refreshTokenValue = options.refreshToken;
    this.expiresAt = options.expiresAt;
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
    this.tokenUrl =
      options.tokenUrl ??
      "https://gw.open.1688.com/openapi/http/1/system.oauth2/getToken";
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
      throw new Alibaba1688Error({
        errorCode: "TOKEN_REFRESH_MISSING",
        errorMessage: "Missing refresh_token for Alibaba 1688 token refresh"
      });
    }

    const timestamp = formatTimestamp(new Date(this.now()));
    const params: Record<string, string> = {
      appKey: this.options.appKey,
      grant_type: "refresh_token",
      refresh_token: this.refreshTokenValue,
      timestamp
    };
    const sign = SignatureGenerator.generate(params, this.options.appSecret);
    const body = new URLSearchParams({ ...params, sign });

    const response = await this.fetchFn(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    const data = await readJson(response);

    if (!response.ok) {
      throw new Alibaba1688Error({
        errorCode: `TOKEN_REFRESH_HTTP_${response.status}`,
        errorMessage: "Alibaba 1688 token refresh failed",
        status: response.status,
        cause: data
      });
    }

    const token = parseTokenResponse(data);
    this.accessToken = token.accessToken;
    this.refreshTokenValue = token.refreshToken ?? this.refreshTokenValue;
    this.expiresAt =
      token.expiresAt ?? this.now() + (token.expiresIn ?? 7200) * 1000;

    return this.accessToken;
  }
}

export function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new Alibaba1688Error({
      errorCode: "TOKEN_REFRESH_INVALID_JSON",
      errorMessage: "Alibaba 1688 token refresh response is not valid JSON",
      status: response.status,
      cause: error
    });
  }
}

function parseTokenResponse(data: unknown): TokenResponse {
  const candidate =
    typeof data === "object" && data !== null && "result" in data
      ? (data as { result: unknown }).result
      : data;

  return TokenResponseSchema.parse(normalizeTokenResponse(candidate));
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
