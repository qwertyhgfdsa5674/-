import {
  Alibaba1688Client,
  type LogisticsInfo,
  type OrderParams
} from "@ai-ecommerce/platform-alibaba1688";
import { Job, Queue, Worker, type WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import type postgres from "postgres";
import { z } from "zod";

export const FulfillmentStatusSchema = z.enum([
  "NEW",
  "SOURCING",
  "PURCHASING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "FAILED",
  "RETRYING",
  "SHIPPING_DELAYED"
]);

export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>;
export type Platform = "douyin" | "pdd" | "taobao";

export interface UnifiedOrderSku {
  skuId: string;
  title: string;
  quantity: number;
  attributes?: Record<string, string>;
  sourceProductId?: string;
  sourceSkuSpec?: string;
}

export interface ShippingAddress {
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
}

export interface UnifiedOrder {
  id: string;
  platform: Platform;
  externalOrderId: string;
  skus: UnifiedOrderSku[];
  shippingAddress: ShippingAddress;
  buyerMessage?: string;
  createdAt?: string;
}

export interface OrderJob {
  order: UnifiedOrder;
  maxRetries?: number;
}

export type OrderQueue = Queue<OrderJob, FulfillmentResult, string>;

export interface TrackingInfo {
  number: string;
  company?: string;
}

export interface FulfillmentResult {
  status: FulfillmentStatus;
  orderId: string;
  purchaseOrderId?: string;
  trackingNumber?: string;
  error?: string;
  retryable?: boolean;
}

export interface SourceCandidate {
  supplierId: string;
  productId: string;
  skuSpec?: string;
  price?: number;
  availableStock?: number;
  priority?: number;
}

export interface SourceMatch {
  success: boolean;
  supplier?: SourceCandidate;
  backup: SourceCandidate[];
  error?: string;
}

export interface SourceMatcher {
  match(skus: UnifiedOrderSku[]): Promise<SourceMatch>;
}

export interface PlatformFulfillmentClient {
  normalizeOrder?(order: UnifiedOrder): Promise<UnifiedOrder>;
  fillTrackingNumber?(orderId: string, tracking: TrackingInfo): Promise<void>;
  notifyBuyer?(orderId: string, message: string): Promise<void>;
}

export type PlatformClients = Partial<
  Record<Platform, PlatformFulfillmentClient>
>;

export interface NotificationService {
  notifyAdmin(title: string, payload: Record<string, unknown>): Promise<void>;
  notifyBuyer?(order: UnifiedOrder, message: string): Promise<void>;
}

export interface OrderStateStore {
  setStatus(
    orderId: string,
    status: FulfillmentStatus,
    details?: Record<string, unknown>
  ): Promise<void>;
  getStatus(orderId: string): Promise<FulfillmentStatus | undefined>;
}

export interface OrderRecordStore {
  saveEvent(orderId: string, event: OrderRecordEvent): Promise<void>;
  saveResult(result: FulfillmentResult): Promise<void>;
}

export interface OrderRecordEvent {
  status: FulfillmentStatus;
  at: string;
  details?: Record<string, unknown>;
}

export interface OrderFulfillmentWorkerOptions {
  workerOptions?: Omit<WorkerOptions, "connection"> & {
    connection?: WorkerOptions["connection"];
  };
  stateStore?: OrderStateStore;
  recordStore?: OrderRecordStore;
  sourceMatcher?: SourceMatcher;
  deadLetterQueue?: OrderQueue;
  trackingTimeoutMs?: number;
  trackingPollIntervalMs?: number;
  purchaseMaxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: StructuredLogger;
}

export interface StructuredLogger {
  info(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

const DEFAULT_TRACKING_TIMEOUT_MS = 48 * 60 * 60 * 1000;
const DEFAULT_TRACKING_POLL_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_PURCHASE_MAX_ATTEMPTS = 3;
const DEFAULT_JOB_MAX_RETRIES = 3;

const VALID_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  NEW: ["SOURCING", "FAILED"],
  SOURCING: ["PURCHASING", "FAILED", "RETRYING"],
  PURCHASING: ["SHIPPED", "SHIPPING_DELAYED", "FAILED", "RETRYING"],
  SHIPPED: ["DELIVERED", "FAILED"],
  DELIVERED: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: ["RETRYING"],
  RETRYING: ["SOURCING", "PURCHASING", "FAILED"],
  SHIPPING_DELAYED: ["SHIPPED", "FAILED", "RETRYING"]
};

export class OrderFulfillmentWorker {
  private worker?: Worker<OrderJob, FulfillmentResult>;
  private readonly stateStore: OrderStateStore;
  private readonly recordStore: OrderRecordStore;
  private readonly sourceMatcher: SourceMatcher;
  private readonly deadLetterQueue: OrderQueue;
  private readonly workerOptions: WorkerOptions;
  private readonly trackingTimeoutMs: number;
  private readonly trackingPollIntervalMs: number;
  private readonly purchaseMaxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: StructuredLogger;

  public constructor(
    private readonly queue: OrderQueue,
    private readonly platformClients: PlatformClients,
    private readonly sourceClient: Alibaba1688Client,
    private readonly notifier: NotificationService,
    options: OrderFulfillmentWorkerOptions = {}
  ) {
    this.stateStore = options.stateStore ?? new RedisOrderStateStore();
    this.recordStore = options.recordStore ?? new NoopOrderRecordStore();
    this.sourceMatcher =
      options.sourceMatcher ?? new AlibabaSourceMatcher(sourceClient);
    this.workerOptions = {
      concurrency: 5,
      lockDuration: 120_000,
      connection: options.workerOptions?.connection ??
        queue.opts.connection ?? {
          url: process.env["REDIS_URL"] ?? "redis://localhost:6379"
        },
      ...options.workerOptions
    };
    this.deadLetterQueue =
      options.deadLetterQueue ??
      new Queue<OrderJob, FulfillmentResult, string>(
        `${queue.name}-dead-letter`,
        {
          connection: this.workerOptions.connection
        }
      );
    this.trackingTimeoutMs =
      options.trackingTimeoutMs ?? DEFAULT_TRACKING_TIMEOUT_MS;
    this.trackingPollIntervalMs =
      options.trackingPollIntervalMs ?? DEFAULT_TRACKING_POLL_INTERVAL_MS;
    this.purchaseMaxAttempts =
      options.purchaseMaxAttempts ?? DEFAULT_PURCHASE_MAX_ATTEMPTS;
    this.sleep = options.sleep ?? sleep;
    this.logger = options.logger ?? pinoLogger;
  }

  public async start(): Promise<void> {
    if (this.worker) {
      return;
    }

    this.worker = new Worker<OrderJob, FulfillmentResult>(
      this.queue.name,
      async (job) => this.runBullMqJob(job),
      this.workerOptions
    );
  }

  public async stop(): Promise<void> {
    await this.worker?.close();
    await this.deadLetterQueue.close();
    this.worker = undefined;
  }

  public async processJob(job: OrderJob): Promise<FulfillmentResult> {
    return this.processOrderFulfillment(job.order);
  }

  private async runBullMqJob(job: Job<OrderJob>): Promise<FulfillmentResult> {
    const result = await this.processJob(job.data);
    const maxRetries = job.data.maxRetries ?? DEFAULT_JOB_MAX_RETRIES;

    if (
      result.status === "FAILED" &&
      result.retryable &&
      job.attemptsMade + 1 < maxRetries
    ) {
      await this.transition(job.data.order.id, "RETRYING", {
        error: result.error,
        attemptsMade: job.attemptsMade + 1
      });
      throw new RetryableFulfillmentError(
        result.error ?? "Retryable fulfillment failure"
      );
    }

    if (result.status === "FAILED" && job.attemptsMade + 1 >= maxRetries) {
      await this.sendToDeadLetter(job, result);
    }

    return result;
  }

  private async processOrderFulfillment(
    order: UnifiedOrder
  ): Promise<FulfillmentResult> {
    await this.transition(order.id, "NEW", {
      platform: order.platform,
      externalOrderId: order.externalOrderId
    });
    const unified = await this.normalizeOrder(order);

    try {
      await this.ensureDeliverable(unified);
      await this.transition(unified.id, "SOURCING");
      const match = await this.sourceMatcher.match(unified.skus);

      if (!match.success || !match.supplier) {
        const error = match.error ?? "Source matching failed";
        await this.notifier.notifyAdmin("货源匹配失败", {
          order: unified.id,
          reason: error
        });
        return this.fail(unified, error, true);
      }

      await this.transition(unified.id, "PURCHASING", {
        supplier: match.supplier.supplierId
      });
      const purchase = await this.create1688OrderWithFallback(
        match.supplier,
        match.backup,
        unified
      );

      if (!purchase.success) {
        await this.notifier.notifyAdmin("1688下单失败", {
          order: unified.id,
          reason: purchase.error
        });
        return this.fail(unified, purchase.error ?? "所有供应商下单失败", true);
      }

      const tracking = await this.waitForTracking(purchase.orderId);

      if (tracking) {
        await this.fillTrackingNumber(unified, tracking);
        await this.transition(unified.id, "SHIPPED", {
          purchaseOrderId: purchase.orderId,
          trackingNumber: tracking.number
        });

        const result = {
          status: "SHIPPED",
          orderId: unified.id,
          purchaseOrderId: purchase.orderId,
          trackingNumber: tracking.number
        } satisfies FulfillmentResult;

        await this.recordStore.saveResult(result);
        return result;
      }

      await this.notifier.notifyAdmin("物流超48小时未发货", {
        order: unified.id,
        purchaseOrderId: purchase.orderId
      });
      await this.notifyBuyer(
        unified,
        "订单已采购成功，供应商发货稍有延迟，我们会继续跟进物流。"
      );
      await this.transition(unified.id, "SHIPPING_DELAYED", {
        purchaseOrderId: purchase.orderId
      });

      const delayed = {
        status: "SHIPPING_DELAYED",
        orderId: unified.id,
        purchaseOrderId: purchase.orderId,
        retryable: true
      } satisfies FulfillmentResult;

      await this.recordStore.saveResult(delayed);
      return delayed;
    } catch (error) {
      const message = errorMessage(error);
      const retryable = isRetryableFulfillmentError(error);

      if (isAddressError(error)) {
        await this.notifier.notifyAdmin("地址无法配送", {
          order: unified.id,
          reason: message
        });
        await this.notifyBuyer(
          unified,
          "收货地址可能无法配送，请联系店铺客服确认地址信息。"
        );
      } else {
        await this.notifier.notifyAdmin("订单履约失败", {
          order: unified.id,
          reason: message,
          retryable
        });
      }

      return this.fail(unified, message, retryable);
    }
  }

  private async normalizeOrder(order: UnifiedOrder): Promise<UnifiedOrder> {
    const client = this.platformClients[order.platform];
    return client?.normalizeOrder ? client.normalizeOrder(order) : order;
  }

  private async ensureDeliverable(order: UnifiedOrder): Promise<void> {
    const address = order.shippingAddress.receiverAddress.trim();

    if (address.length < 6 || /无法配送|不配送|偏远/.test(address)) {
      throw new AddressUndeliverableError(
        `Address cannot be delivered: ${address}`
      );
    }
  }

  private async create1688OrderWithFallback(
    supplier: SourceCandidate,
    backups: SourceCandidate[],
    order: UnifiedOrder
  ): Promise<
    { success: true; orderId: string } | { success: false; error: string }
  > {
    const candidates = [supplier, ...backups];
    let lastError = "所有供应商下单失败";

    for (const candidate of candidates) {
      const result = await this.create1688Order(candidate, order);

      if (result.success) {
        return result;
      }

      lastError = result.error;
      await this.notifier.notifyAdmin("供应商下单失败，尝试备用供应商", {
        order: order.id,
        supplier: candidate.supplierId,
        reason: result.error
      });
    }

    return { success: false, error: lastError };
  }

  private async create1688Order(
    supplier: SourceCandidate,
    order: UnifiedOrder
  ): Promise<
    { success: true; orderId: string } | { success: false; error: string }
  > {
    const params = to1688OrderParams(supplier, order);

    for (let attempt = 1; attempt <= this.purchaseMaxAttempts; attempt += 1) {
      try {
        const created = await this.sourceClient.createOrder(params);

        if (created.status === "created" || created.status === "paid") {
          return { success: true, orderId: created.orderId };
        }

        return {
          success: false,
          error: created.message ?? `1688 order status is ${created.status}`
        };
      } catch (error) {
        if (attempt >= this.purchaseMaxAttempts) {
          return { success: false, error: errorMessage(error) };
        }

        await this.sleep(2 ** (attempt - 1) * 500);
      }
    }

    return { success: false, error: "1688 order retry exhausted" };
  }

  private async waitForTracking(
    orderId: string
  ): Promise<TrackingInfo | undefined> {
    const deadline = Date.now() + this.trackingTimeoutMs;

    while (Date.now() <= deadline) {
      const logistics = await this.sourceClient.getLogistics(orderId);
      const tracking = toTrackingInfo(logistics);

      if (tracking) {
        return tracking;
      }

      await this.sleep(this.trackingPollIntervalMs);
    }

    return undefined;
  }

  private async fillTrackingNumber(
    order: UnifiedOrder,
    tracking: TrackingInfo
  ): Promise<void> {
    const client = this.platformClients[order.platform];

    if (client?.fillTrackingNumber) {
      await client.fillTrackingNumber(order.id, tracking);
    }
  }

  private async notifyBuyer(
    order: UnifiedOrder,
    message: string
  ): Promise<void> {
    const platformClient = this.platformClients[order.platform];

    if (platformClient?.notifyBuyer) {
      await platformClient.notifyBuyer(order.id, message);
      return;
    }

    await this.notifier.notifyBuyer?.(order, message);
  }

  private async fail(
    order: UnifiedOrder,
    error: string,
    retryable: boolean
  ): Promise<FulfillmentResult> {
    await this.transition(order.id, "FAILED", { error, retryable });
    const result = {
      status: "FAILED",
      orderId: order.id,
      error,
      retryable
    } satisfies FulfillmentResult;

    await this.recordStore.saveResult(result);
    return result;
  }

  private async transition(
    orderId: string,
    nextStatus: FulfillmentStatus,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    const current = await this.stateStore.getStatus(orderId);

    if (
      current &&
      current !== nextStatus &&
      !VALID_TRANSITIONS[current].includes(nextStatus)
    ) {
      throw new Error(
        `Invalid fulfillment transition: ${current} -> ${nextStatus}`
      );
    }

    await this.stateStore.setStatus(orderId, nextStatus, details);
    await this.recordStore.saveEvent(orderId, {
      status: nextStatus,
      at: new Date().toISOString(),
      details
    });
    this.logger.info({
      event: "order_fulfillment_status_changed",
      orderId,
      from: current ?? null,
      to: nextStatus,
      details
    });
  }

  private async sendToDeadLetter(
    job: Job<OrderJob>,
    result: FulfillmentResult
  ): Promise<void> {
    await this.deadLetterQueue.add("order-fulfillment-dead-letter", job.data, {
      jobId: `${job.id ?? job.data.order.id}:dead-letter`,
      removeOnComplete: false
    });
    await this.notifier.notifyAdmin("订单进入死信队列", {
      order: job.data.order.id,
      jobId: job.id,
      error: result.error
    });
  }
}

const ORDER_STATE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export class RedisOrderStateStore implements OrderStateStore {
  private readonly redis: Redis;

  public constructor(
    redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379",
    redis?: Redis
  ) {
    this.redis = redis ?? new Redis(redisUrl);
  }

  public async setStatus(
    orderId: string,
    status: FulfillmentStatus,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    const key = `order:fulfillment:${orderId}`;
    await this.redis.hset(key, {
      status,
      updatedAt: new Date().toISOString(),
      details: JSON.stringify(details)
    });
    await this.redis.expire(key, ORDER_STATE_TTL_SECONDS);
  }

  public async getStatus(
    orderId: string
  ): Promise<FulfillmentStatus | undefined> {
    const status = await this.redis.hget(
      `order:fulfillment:${orderId}`,
      "status"
    );
    const parsed = FulfillmentStatusSchema.safeParse(status);
    return parsed.success ? parsed.data : undefined;
  }
}

export class PostgresOrderRecordStore implements OrderRecordStore {
  public constructor(private readonly sql: postgres.Sql) {}

  public async saveEvent(
    orderId: string,
    event: OrderRecordEvent
  ): Promise<void> {
    await this.sql`
      insert into order_fulfillment_events (order_id, status, details, created_at)
      values (${orderId}, ${event.status}, ${JSON.stringify(event.details ?? {})}, ${event.at})
    `;
  }

  public async saveResult(result: FulfillmentResult): Promise<void> {
    await this.sql`
      insert into order_fulfillment_results (order_id, status, purchase_order_id, tracking_number, error, retryable, updated_at)
      values (
        ${result.orderId},
        ${result.status},
        ${result.purchaseOrderId ?? null},
        ${result.trackingNumber ?? null},
        ${result.error ?? null},
        ${result.retryable ?? false},
        ${new Date().toISOString()}
      )
      on conflict (order_id) do update set
        status = excluded.status,
        purchase_order_id = excluded.purchase_order_id,
        tracking_number = excluded.tracking_number,
        error = excluded.error,
        retryable = excluded.retryable,
        updated_at = excluded.updated_at
    `;
  }
}

export class FeishuNotificationService implements NotificationService {
  public constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  public async notifyAdmin(
    title: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const response = await this.fetchFn(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: {
          text: `${title}\n${JSON.stringify(payload, null, 2)}`
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Feishu webhook failed with status ${response.status}`);
    }
  }
}

export class AlibabaSourceMatcher implements SourceMatcher {
  public constructor(private readonly sourceClient: Alibaba1688Client) {}

  public async match(skus: UnifiedOrderSku[]): Promise<SourceMatch> {
    const candidates: SourceCandidate[] = [];

    for (const sku of skus) {
      if (sku.sourceProductId) {
        const inventory = await this.sourceClient.getProductInventory(
          sku.sourceProductId
        );
        const sourceSku = inventory.skus.find(
          (item) => item.spec === sku.sourceSkuSpec || item.spec === sku.skuId
        );

        if (!sourceSku || sourceSku.stock < sku.quantity) {
          continue;
        }

        candidates.push({
          supplierId: sku.sourceProductId,
          productId: sku.sourceProductId,
          skuSpec: sourceSku.spec,
          price: sourceSku.price,
          availableStock: sourceSku.stock,
          priority: 1
        });
      }
    }

    const [supplier, ...backup] = candidates.sort((left, right) => {
      return (left.priority ?? 100) - (right.priority ?? 100);
    });

    if (!supplier) {
      return {
        success: false,
        backup: [],
        error: "货源缺货或未配置 sourceProductId"
      };
    }

    return {
      success: true,
      supplier,
      backup
    };
  }
}

export class NoopOrderRecordStore implements OrderRecordStore {
  public async saveEvent(): Promise<void> {}
  public async saveResult(): Promise<void> {}
}

export class MemoryOrderStateStore implements OrderStateStore {
  private readonly statuses = new Map<string, FulfillmentStatus>();

  public async setStatus(
    orderId: string,
    status: FulfillmentStatus
  ): Promise<void> {
    this.statuses.set(orderId, status);
  }

  public async getStatus(
    orderId: string
  ): Promise<FulfillmentStatus | undefined> {
    return this.statuses.get(orderId);
  }
}

export class RetryableFulfillmentError extends Error {}
export class AddressUndeliverableError extends Error {}

function to1688OrderParams(
  supplier: SourceCandidate,
  order: UnifiedOrder
): OrderParams {
  const firstSku = order.skus[0];

  if (!firstSku) {
    throw new Error("Order has no SKUs");
  }

  return {
    productId: supplier.productId,
    quantity: order.skus.reduce((total, sku) => total + sku.quantity, 0),
    skuSpec: supplier.skuSpec ?? firstSku.sourceSkuSpec,
    receiverName: order.shippingAddress.receiverName,
    receiverPhone: order.shippingAddress.receiverPhone,
    receiverAddress: order.shippingAddress.receiverAddress,
    idempotencyKey: `fulfillment:${order.id}:${supplier.productId}`
  };
}

function toTrackingInfo(logistics: LogisticsInfo): TrackingInfo | undefined {
  if (!logistics.trackingNumber) {
    return undefined;
  }

  return {
    number: logistics.trackingNumber,
    company: logistics.company
  };
}

function isRetryableFulfillmentError(error: unknown): boolean {
  return !(error instanceof AddressUndeliverableError);
}

function isAddressError(error: unknown): boolean {
  return error instanceof AddressUndeliverableError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const pinoLogger: StructuredLogger = pino({
  base: undefined,
  level: process.env["LOG_LEVEL"] ?? "info"
});
