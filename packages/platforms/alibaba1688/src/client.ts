import { Alibaba1688Error } from "./errors.js";
import { RateLimiter } from "./rate-limiter.js";
import {
  Alibaba1688ConfigSchema,
  CategorySchema,
  InventoryInfoSchema,
  LogisticsInfoSchema,
  OpenApiEnvelopeSchema,
  OrderParamsSchema,
  OrderResultSchema,
  PriceInfoSchema,
  ProductDetailSchema,
  SearchParamsSchema,
  SearchResultSchema,
  SellerInfoSchema,
  type Alibaba1688Config,
  type Category,
  type InventoryInfo,
  type LogisticsInfo,
  type OrderParams,
  type OrderResult,
  type PriceInfo,
  type ProductDetail,
  type SearchParams,
  type SearchResult,
  type SellerInfo
} from "./schemas.js";
import { SignatureGenerator } from "./signature.js";
import { formatTimestamp, TokenManager, type FetchLike } from "./token-manager.js";

const METHOD_MAP = {
  searchProducts: "com.alibaba.product.search",
  getProductDetail: "com.alibaba.product.get",
  getSellerInfo: "com.alibaba.seller.get",
  getCategories: "com.alibaba.category.get",
  getProductPrice: "com.alibaba.product.price.get",
  getProductInventory: "com.alibaba.product.inventory.get",
  createOrder: "com.alibaba.trade.create",
  getLogistics: "com.alibaba.logistics.get"
} as const;

export interface Alibaba1688ClientOptions {
  fetchFn?: FetchLike;
  rateLimiter?: RateLimiter;
  tokenManager?: TokenManager;
}

export class Alibaba1688Client {
  private readonly config;
  private readonly fetchFn: FetchLike;
  private readonly rateLimiter: RateLimiter;
  private readonly tokenManager: TokenManager;

  public constructor(config: Alibaba1688Config = {}, options: Alibaba1688ClientOptions = {}) {
    this.config = Alibaba1688ConfigSchema.parse({
      appKey: config.appKey ?? process.env["ALIBABA_APP_KEY"],
      appSecret: config.appSecret ?? process.env["ALIBABA_APP_SECRET"],
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      tokenExpiresAt: config.tokenExpiresAt,
      apiBaseUrl: config.apiBaseUrl,
      tokenUrl: config.tokenUrl,
      requestsPerMinute: config.requestsPerMinute
    });
    this.fetchFn = options.fetchFn ?? fetch;
    this.rateLimiter = options.rateLimiter ?? new RateLimiter(this.config.requestsPerMinute);
    this.tokenManager =
      options.tokenManager ??
      new TokenManager({
        appKey: this.config.appKey,
        appSecret: this.config.appSecret,
        accessToken: this.config.accessToken,
        refreshToken: this.config.refreshToken,
        expiresAt: this.config.tokenExpiresAt,
        tokenUrl: this.config.tokenUrl,
        fetchFn: this.fetchFn
      });
  }

  public async searchProducts(params: SearchParams): Promise<SearchResult> {
    const result = await this.callApi("searchProducts", SearchParamsSchema.parse(params));
    return SearchResultSchema.parse(result);
  }

  public async getProductDetail(productIds: string[]): Promise<ProductDetail[]> {
    const result = await this.callApi("getProductDetail", { productIds });
    return ProductDetailSchema.array().parse(result);
  }

  public async getSellerInfo(sellerId: string): Promise<SellerInfo> {
    const result = await this.callApi("getSellerInfo", { sellerId });
    return SellerInfoSchema.parse(result);
  }

  public async getCategories(parentId?: string): Promise<Category[]> {
    const result = await this.callApi("getCategories", { parentId });
    return CategorySchema.array().parse(result);
  }

  public async getProductPrice(productId: string): Promise<PriceInfo> {
    const result = await this.callApi("getProductPrice", { productId });
    return PriceInfoSchema.parse(result);
  }

  public async getProductInventory(productId: string): Promise<InventoryInfo> {
    const result = await this.callApi("getProductInventory", { productId });
    return InventoryInfoSchema.parse(result);
  }

  public async createOrder(params: OrderParams): Promise<OrderResult> {
    const result = await this.callApi("createOrder", OrderParamsSchema.parse(params));
    return OrderResultSchema.parse(result);
  }

  public async getLogistics(orderId: string): Promise<LogisticsInfo> {
    const result = await this.callApi("getLogistics", { orderId });
    return LogisticsInfoSchema.parse(result);
  }

  public getConfig(): Readonly<typeof this.config> {
    return this.config;
  }

  private async callApi(methodKey: keyof typeof METHOD_MAP, params: Record<string, unknown>): Promise<unknown> {
    await this.rateLimiter.acquire();

    const startedAt = Date.now();
    const method = METHOD_MAP[methodKey];
    const requestParams = await this.buildSignedParams(method, params);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetchFn(this.config.apiBaseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(toStringRecord(requestParams))
      });

      const duration = Date.now() - startedAt;
      this.logApiCall(method, params, duration, response.status);

      const payload = await this.readResponse(response);

      if (response.ok) {
        return this.extractResult(payload, response.status);
      }

      if (!isRetryable(response.status) || attempt === 2) {
        throw this.toError(payload, response.status);
      }

      await sleep(2 ** attempt * 250);
    }

    throw new Alibaba1688Error({
      errorCode: "RETRY_EXHAUSTED",
      errorMessage: "Alibaba 1688 request retry exhausted"
    });
  }

  private async buildSignedParams(
    method: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const accessToken = await this.tokenManager.getAccessToken();
    const signedParams = {
      ...params,
      access_token: accessToken,
      app_key: this.config.appKey,
      method,
      timestamp: formatTimestamp(new Date()),
      v: "1.0"
    };

    return {
      ...signedParams,
      sign: SignatureGenerator.generate(signedParams, this.config.appSecret)
    };
  }

  private async readResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new Alibaba1688Error({
        errorCode: "INVALID_JSON",
        errorMessage: "Alibaba 1688 API response is not valid JSON",
        status: response.status,
        cause: error
      });
    }
  }

  private extractResult(payload: unknown, status: number): unknown {
    const envelope = OpenApiEnvelopeSchema.safeParse(payload);

    if (!envelope.success) {
      return payload;
    }

    if (envelope.data.success === false || envelope.data.errorCode) {
      throw new Alibaba1688Error({
        errorCode: envelope.data.errorCode ?? "OPENAPI_ERROR",
        errorMessage: envelope.data.errorMessage ?? "Alibaba 1688 API returned an error",
        status
      });
    }

    return envelope.data.result ?? payload;
  }

  private toError(payload: unknown, status: number): Alibaba1688Error {
    const envelope = OpenApiEnvelopeSchema.safeParse(payload);

    if (envelope.success) {
      return new Alibaba1688Error({
        errorCode: envelope.data.errorCode ?? `HTTP_${status}`,
        errorMessage: envelope.data.errorMessage ?? "Alibaba 1688 API request failed",
        status,
        cause: payload
      });
    }

    return new Alibaba1688Error({
      errorCode: `HTTP_${status}`,
      errorMessage: "Alibaba 1688 API request failed",
      status,
      cause: payload
    });
  }

  private logApiCall(
    method: string,
    params: Record<string, unknown>,
    duration: number,
    status: number
  ): void {
    console.info(
      JSON.stringify({
        service: "alibaba1688",
        method,
        params: redactSensitiveParams(params),
        duration,
        status
      })
    );
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStringRecord(params: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
  );
}

function redactSensitiveParams(params: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = new Set(["access_token", "refresh_token", "appSecret", "app_secret", "sign"]);

  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, sensitiveKeys.has(key) ? "[REDACTED]" : value])
  );
}
