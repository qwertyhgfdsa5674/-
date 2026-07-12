const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const API_TOKEN_STORAGE_KEY = "ai-ecommerce.apiToken";
let memoryApiToken: string | undefined;

export class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const apiToken = getApiToken();
  const url = `${BASE_URL}${path}`;
  const response = apiToken
    ? await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiToken}`
        }
      })
    : await fetch(url);

  if (!response.ok) {
    const body = await safeReadJson(response);
    throw new ApiRequestError(
      `API request failed: ${response.status}`,
      response.status,
      body
    );
  }

  return (await response.json()) as T;
}

export function getApiToken(): string | undefined {
  const storedToken = readStoredApiToken();
  const envToken = import.meta.env.VITE_API_TOKEN;

  return storedToken || envToken || undefined;
}

export function setApiToken(token: string): void {
  memoryApiToken = token;

  if (!hasStorage()) {
    return;
  }

  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
}

export function clearApiToken(): void {
  memoryApiToken = undefined;

  if (!hasStorage()) {
    return;
  }

  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function readStoredApiToken(): string | undefined {
  if (memoryApiToken) {
    return memoryApiToken;
  }

  if (!hasStorage()) {
    return undefined;
  }

  return window.localStorage.getItem(API_TOKEN_STORAGE_KEY) ?? undefined;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}
