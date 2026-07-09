import { PddError } from "./errors.js";
import { PddRateLimiter } from "./rate-limiter.js";
import {
  AddGoodsParamsSchema,
  AddGoodsResultSchema,
  GoodsDetailSchema,
  GoodsListQuerySchema,
  GoodsListResultSchema,
  LogisticsCompanySchema,
  LogisticsInfoSchema,
  OrderDetailSchema,
  OrderListQuerySchema,
  OrderListResultSchema,
  PddConfigSchema,
  PddEnvelopeSchema,
  UpdateGoodsParamsSchema,
  type AddGoodsParams,
  type AddGoodsResult,
  type GoodsDetail,
  type GoodsListQuery,
  type GoodsListResult,
  type LogisticsCompany,
  type LogisticsInfo,
  type OrderDetail,
  type OrderListQuery,
  type OrderListResult,
  type PddConfig,
  type UpdateGoodsParams
} from "./schemas.js";
import { PddSignatureGenerator } from "./signature.js";
import { PddTokenManager, type FetchLike } from "./token-manager.js";

const METHOD_MAP = {
  addGoods: "pdd.goods.add",
  updateGoods: "pdd.goods.update",
  getGoodsList: "pdd.goods.list.get",
  getGoodsDetail: "pdd.goods.detail.get",
  updateStock: "pdd.goods.sku.stock.update",
  updatePrice: "pdd.goods.sku.price.update",
  setSaleStatus: "pdd.goods.sale.status.set",
  getOrderList: "pdd.order.list.get",
  getOrderDetail: "pdd.order.information.get",
  sendGoods: "pdd.logistics.online.send",
  getLogisticsCompanies: "pdd.logistics.companies.get"
} as const;

export interface PddClientOptions {
  fetchFn?: FetchLike;
  rateLimiter?: PddRateLimiter;
  tokenManager?: PddTokenManager;
}

export class PddClient {
  private readonly config;
  private readonly fetchFn: FetchLike;
  private readonly rateLimiter: PddRateLimiter;
  private readonly tokenManager: PddTokenManager;

  public constructor(config: PddConfig = {}, options: PddClientOptions = {}) {
    this.config = PddConfigSchema.parse({
      clientId: config.clientId ?? process.env["PDD_CLIENT_ID"],
      clientSecret: config.clientSecret ?? process.env["PDD_CLIENT_SECRET"],
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      tokenExpiresAt: config.tokenExpiresAt,
      apiBaseUrl: config.apiBaseUrl,
      tokenUrl: config.tokenUrl,
      requestsPerSecond: config.requestsPerSecond,
      signMethod: config.signMethod
    });
    this.fetchFn = options.fetchFn ?? fetch;
    this.rateLimiter =
      options.rateLimiter ?? new PddRateLimiter(this.config.requestsPerSecond);
    this.tokenManager =
      options.tokenManager ??
      new PddTokenManager({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        accessToken: this.config.accessToken,
        refreshToken: this.config.refreshToken,
        expiresAt: this.config.tokenExpiresAt,
        tokenUrl: this.config.tokenUrl,
        fetchFn: this.fetchFn
      });
  }

  public async addGoods(params: AddGoodsParams): Promise<AddGoodsResult> {
    const result = await this.callApi(
      "addGoods",
      AddGoodsParamsSchema.parse(params)
    );
    return AddGoodsResultSchema.parse(result);
  }

  public async updateGoods(params: UpdateGoodsParams): Promise<void> {
    await this.callApi("updateGoods", UpdateGoodsParamsSchema.parse(params));
  }

  public async getGoodsList(params: GoodsListQuery): Promise<GoodsListResult> {
    const result = await this.callApi(
      "getGoodsList",
      GoodsListQuerySchema.parse(params)
    );
    return GoodsListResultSchema.parse(result);
  }

  public async getGoodsDetail(goodsId: string): Promise<GoodsDetail> {
    const result = await this.callApi("getGoodsDetail", { goodsId });
    return GoodsDetailSchema.parse(result);
  }

  public async updateStock(skuId: string, quantity: number): Promise<void> {
    await this.callApi("updateStock", { skuId, quantity });
  }

  public async updatePrice(skuId: string, price: number): Promise<void> {
    await this.callApi("updatePrice", { skuId, price });
  }

  public async setSaleStatus(
    goodsId: string,
    isOnsale: boolean
  ): Promise<void> {
    await this.callApi("setSaleStatus", { goodsId, isOnsale });
  }

  public async getOrderList(params: OrderListQuery): Promise<OrderListResult> {
    const result = await this.callApi(
      "getOrderList",
      OrderListQuerySchema.parse(params)
    );
    return OrderListResultSchema.parse(result);
  }

  public async getOrderDetail(orderSn: string): Promise<OrderDetail> {
    const result = await this.callApi("getOrderDetail", { orderSn });
    return OrderDetailSchema.parse(result);
  }

  public async sendGoods(
    orderSn: string,
    logistics: LogisticsInfo
  ): Promise<void> {
    await this.callApi("sendGoods", {
      orderSn,
      logistics: LogisticsInfoSchema.parse(logistics)
    });
  }

  public async getLogisticsCompanies(): Promise<LogisticsCompany[]> {
    const result = await this.callApi("getLogisticsCompanies", {});
    return LogisticsCompanySchema.array().parse(result);
  }

  public getConfig(): Readonly<typeof this.config> {
    return this.config;
  }

  private async callApi(
    methodKey: keyof typeof METHOD_MAP,
    params: Record<string, unknown>
  ): Promise<unknown> {
    await this.rateLimiter.acquire();

    const startedAt = Date.now();
    const method = METHOD_MAP[methodKey];
    const requestParams = await this.buildSignedParams(method, params);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetchFn(this.config.apiBaseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(requestParams)
      });
      const duration = Date.now() - startedAt;
      this.logApiCall(method, params, duration, response.status);
      const payload = await this.readResponse(response);

      if (response.ok) {
        return this.extractResult(payload, method, response.status);
      }

      if (!isRetryable(response.status) || attempt === 2) {
        throw this.toError(payload, response.status);
      }

      await sleep(2 ** attempt * 250);
    }

    throw new PddError({
      errorCode: "RETRY_EXHAUSTED",
      errorMessage: "PDD request retry exhausted"
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
      client_id: this.config.clientId,
      data_type: "JSON",
      sign_method: this.config.signMethod,
      timestamp: Math.floor(Date.now() / 1000),
      type: method
    };

    return {
      ...signedParams,
      sign: PddSignatureGenerator.generate(
        signedParams,
        this.config.clientSecret,
        this.config.signMethod
      )
    };
  }

  private async readResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new PddError({
        errorCode: "INVALID_JSON",
        errorMessage: "PDD API response is not valid JSON",
        status: response.status,
        cause: error
      });
    }
  }

  private extractResult(
    payload: unknown,
    method: string,
    status: number
  ): unknown {
    const envelope = PddEnvelopeSchema.safeParse(payload);

    if (envelope.success && envelope.data.error_response) {
      throw new PddError({
        errorCode: String(envelope.data.error_response.error_code),
        errorMessage:
          envelope.data.error_response.error_msg ?? "PDD API returned an error",
        status,
        cause: payload
      });
    }

    if (typeof payload === "object" && payload !== null) {
      const responseKey = `${method.replaceAll(".", "_")}_response`;
      const raw = payload as Record<string, unknown>;
      return raw[responseKey] ?? raw.result ?? payload;
    }

    return payload;
  }

  private toError(payload: unknown, status: number): PddError {
    const envelope = PddEnvelopeSchema.safeParse(payload);

    if (envelope.success && envelope.data.error_response) {
      return new PddError({
        errorCode: String(envelope.data.error_response.error_code),
        errorMessage:
          envelope.data.error_response.error_msg ?? "PDD API request failed",
        status,
        cause: payload
      });
    }

    return new PddError({
      errorCode: `HTTP_${status}`,
      errorMessage: "PDD API request failed",
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
        service: "pdd",
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

function redactSensitiveParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const sensitiveKeys = new Set([
    "access_token",
    "refresh_token",
    "clientSecret",
    "client_secret",
    "sign"
  ]);

  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      sensitiveKeys.has(key) ? "[REDACTED]" : value
    ])
  );
}
