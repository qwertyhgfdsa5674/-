import type { Alibaba1688Client } from "@ai-ecommerce/platform-alibaba1688";
import { describe, expect, it } from "vitest";

import {
  AddressUndeliverableError,
  MemoryOrderStateStore,
  OrderFulfillmentWorker,
  type FulfillmentResult,
  type NotificationService,
  type OrderQueue,
  type OrderRecordEvent,
  type OrderRecordStore,
  type PlatformClients,
  type SourceMatcher,
  type UnifiedOrder
} from "../src/workers/order-fulfillment.js";

const baseOrder: UnifiedOrder = {
  id: "order-1",
  platform: "pdd",
  externalOrderId: "pdd-1",
  skus: [
    {
      skuId: "sku-1",
      title: "Insulated cup",
      quantity: 2,
      sourceProductId: "source-1",
      sourceSkuSpec: "white"
    }
  ],
  shippingAddress: {
    receiverName: "Chen",
    receiverPhone: "13800000000",
    receiverAddress: "Shanghai Pudong Sample Road 88"
  }
};

describe("OrderFulfillmentWorker", () => {
  it("purchases from 1688, waits for tracking, and fills platform tracking", async () => {
    const sourceClient = createSourceClient({
      orderIds: ["purchase-1"],
      trackingNumbers: ["YT123"]
    });
    const platformClients = createPlatformClients();
    const worker = createWorker({
      sourceClient,
      platformClients
    });

    const result = await worker.processJob({ order: baseOrder });

    expect(result.status).toBe("SHIPPED");
    expect(result.purchaseOrderId).toBe("purchase-1");
    expect(result.trackingNumber).toBe("YT123");
    expect(platformClients.pdd?.filled).toEqual([
      {
        orderId: "order-1",
        tracking: {
          number: "YT123",
          company: "YTO"
        }
      }
    ]);
  });

  it("switches to a backup supplier when the primary supplier purchase fails", async () => {
    const sourceClient = createSourceClient({
      createFailures: ["out of stock", "out of stock", "out of stock"],
      orderIds: ["backup-purchase"],
      trackingNumbers: ["SF999"]
    });
    const worker = createWorker({
      sourceClient,
      sourceMatcher: {
        async match() {
          return {
            success: true,
            supplier: {
              supplierId: "primary",
              productId: "primary-product",
              skuSpec: "white"
            },
            backup: [
              {
                supplierId: "backup",
                productId: "backup-product",
                skuSpec: "white"
              }
            ]
          };
        }
      }
    });

    const result = await worker.processJob({ order: baseOrder });

    expect(result.status).toBe("SHIPPED");
    expect(result.purchaseOrderId).toBe("backup-purchase");
    expect(sourceClient.createdProductIds).toEqual([
      "primary-product",
      "primary-product",
      "primary-product",
      "backup-product"
    ]);
  });

  it("fails and notifies admin when source matching fails", async () => {
    const notifier = createNotifier();
    const worker = createWorker({
      notifier,
      sourceMatcher: {
        async match() {
          return {
            success: false,
            backup: [],
            error: "no supplier stock"
          };
        }
      }
    });

    const result = await worker.processJob({ order: baseOrder });

    expect(result).toMatchObject({
      status: "FAILED",
      retryable: true,
      error: "no supplier stock"
    });
    expect(notifier.adminTitles).toContain("货源匹配失败");
  });

  it("returns shipping delayed when tracking is not available before timeout", async () => {
    const notifier = createNotifier();
    const worker = createWorker({
      notifier,
      sourceClient: createSourceClient({
        orderIds: ["purchase-1"],
        trackingNumbers: []
      }),
      trackingTimeoutMs: 0
    });

    const result = await worker.processJob({ order: baseOrder });

    expect(result.status).toBe("SHIPPING_DELAYED");
    expect(result.retryable).toBe(true);
    expect(notifier.adminTitles).toContain("物流超48小时未发货");
  });

  it("marks undeliverable addresses as failed without retry", async () => {
    const notifier = createNotifier();
    const worker = createWorker({ notifier });

    const result = await worker.processJob({
      order: {
        ...baseOrder,
        shippingAddress: {
          ...baseOrder.shippingAddress,
          receiverAddress: "偏远无法配送"
        }
      }
    });

    expect(result.status).toBe("FAILED");
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("Address cannot be delivered");
    expect(notifier.adminTitles).toContain("地址无法配送");
  });
});

function createWorker(
  args: {
    sourceClient?: FakeAlibabaClient;
    sourceMatcher?: SourceMatcher;
    notifier?: FakeNotifier;
    platformClients?: FakePlatformClients;
    trackingTimeoutMs?: number;
  } = {}
): OrderFulfillmentWorker {
  const sourceClient =
    args.sourceClient ??
    createSourceClient({
      orderIds: ["purchase-1"],
      trackingNumbers: ["YT123"]
    });
  const stateStore = new MemoryOrderStateStore();

  return new OrderFulfillmentWorker(
    createQueue(),
    args.platformClients ?? createPlatformClients(),
    sourceClient as unknown as Alibaba1688Client,
    args.notifier ?? createNotifier(),
    {
      stateStore,
      recordStore: new MemoryRecordStore(),
      sourceMatcher:
        args.sourceMatcher ??
        ({
          async match() {
            return {
              success: true,
              supplier: {
                supplierId: "supplier-1",
                productId: "source-1",
                skuSpec: "white",
                availableStock: 10
              },
              backup: []
            };
          }
        } satisfies SourceMatcher),
      deadLetterQueue: createQueue("test-order-fulfillment-dead-letter"),
      trackingTimeoutMs: args.trackingTimeoutMs ?? 20,
      trackingPollIntervalMs: 1,
      sleep: async () => {},
      logger: {
        info() {},
        error() {}
      }
    }
  );
}

function createQueue(name = "test-order-fulfillment"): OrderQueue {
  return {
    name,
    opts: {
      connection: {
        url: "redis://localhost:6379"
      }
    },
    async add() {
      return undefined;
    },
    async close() {}
  } as unknown as OrderQueue;
}

function createSourceClient(args: {
  createFailures?: string[];
  orderIds: string[];
  trackingNumbers: string[];
}): FakeAlibabaClient {
  return {
    createdProductIds: [],
    async createOrder(params) {
      this.createdProductIds.push(params.productId);
      const failure = args.createFailures?.shift();

      if (failure) {
        throw new Error(failure);
      }

      return {
        orderId: args.orderIds.shift() ?? "purchase-fallback",
        status: "created"
      };
    },
    async getLogistics(orderId) {
      const trackingNumber = args.trackingNumbers.shift();

      return {
        orderId,
        company: trackingNumber ? "YTO" : undefined,
        trackingNumber,
        status: trackingNumber ? "shipped" : "pending",
        traces: []
      };
    }
  };
}

function createNotifier(): FakeNotifier {
  return {
    adminTitles: [],
    buyerMessages: [],
    async notifyAdmin(title) {
      this.adminTitles.push(title);
    },
    async notifyBuyer(order, message) {
      this.buyerMessages.push({ orderId: order.id, message });
    }
  };
}

function createPlatformClients(): FakePlatformClients {
  return {
    pdd: {
      filled: [],
      async fillTrackingNumber(orderId, tracking) {
        this.filled.push({ orderId, tracking });
      }
    }
  };
}

class MemoryRecordStore implements OrderRecordStore {
  public readonly events: OrderRecordEvent[] = [];
  public readonly results: FulfillmentResult[] = [];

  public async saveEvent(
    _orderId: string,
    event: OrderRecordEvent
  ): Promise<void> {
    this.events.push(event);
  }

  public async saveResult(result: FulfillmentResult): Promise<void> {
    this.results.push(result);
  }
}

interface FakeAlibabaClient {
  createdProductIds: string[];
  createOrder(params: {
    productId: string;
    quantity: number;
    skuSpec?: string;
    receiverName: string;
    receiverPhone: string;
    receiverAddress: string;
    idempotencyKey: string;
  }): Promise<{
    orderId: string;
    status: "created" | "paid" | "failed";
    message?: string;
  }>;
  getLogistics(orderId: string): Promise<{
    orderId: string;
    company?: string;
    trackingNumber?: string;
    status: string;
    traces: Array<{ time: string; content: string }>;
  }>;
}

interface FakeNotifier extends NotificationService {
  adminTitles: string[];
  buyerMessages: Array<{ orderId: string; message: string }>;
}

interface FakePlatformClients extends PlatformClients {
  pdd: {
    filled: Array<{
      orderId: string;
      tracking: { number: string; company?: string };
    }>;
    fillTrackingNumber(
      orderId: string,
      tracking: { number: string; company?: string }
    ): Promise<void>;
  };
}

void AddressUndeliverableError;
