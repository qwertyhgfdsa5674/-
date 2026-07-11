import Fastify from "fastify";
import { Queue } from "bullmq";
import { createIdempotencyKey } from "@ai-ecommerce/core";
import { AbTestAnalyzer, ContentVariantSchema } from "@ai-ecommerce/ab-test";
import {
  createDefaultTrendSources,
  EventCalendar,
  TrendAggregator
} from "@ai-ecommerce/data-pipeline";
import {
  DynamicPricingEngine,
  PricingInputSchema
} from "@ai-ecommerce/dynamic-pricing";
import {
  InventoryInputSchema,
  InventoryPlanner
} from "@ai-ecommerce/inventory-planner";
import {
  ComplianceInputSchema,
  ComplianceScanner
} from "@ai-ecommerce/risk-control";
import { z } from "zod";

export function createServer() {
  const app = Fastify({ logger: true });
  const trendAggregator = new TrendAggregator();
  const calendar = new EventCalendar();
  const pricing = new DynamicPricingEngine();
  const inventory = new InventoryPlanner();
  const compliance = new ComplianceScanner();
  const abTests = new AbTestAnalyzer();

  app.get("/health", async () => ({
    ok: true,
    service: "ai-ecommerce-server",
    checks: {
      http: "ok",
      queue: "configured"
    }
  }));

  app.get("/api/trends", async () => {
    const trends = await trendAggregator.collectAndAggregate(
      createDefaultTrendSources()
    );
    return { sourceType: "mock", trends };
  });

  app.get("/api/events", async () => ({
    events: calendar.list(),
    upcoming: calendar.upcoming()
  }));

  app.get("/api/dashboard", async () => mockDashboard());

  app.get("/api/products", async () => mockProducts());

  app.get("/api/orders", async () => mockOrders());

  app.get("/api/sourcing", async () => mockSourcing());

  app.get("/api/analytics", async () => mockAnalytics());

  app.post("/api/pricing/recommend", async (request) => {
    const body = PricingInputSchema.parse(request.body);
    return pricing.recommend(body);
  });

  app.post("/api/inventory/forecast", async (request) => {
    const body = InventoryInputSchema.parse(request.body);
    return inventory.forecast(body);
  });

  app.post("/api/compliance/check", async (request) => {
    const body = ComplianceInputSchema.parse(request.body);
    return compliance.scan(body);
  });

  app.post("/api/ab-tests/winner", async (request) => {
    const body = z
      .object({
        variants: z.array(ContentVariantSchema).default([]),
        minImpressions: z.number().int().positive().optional()
      })
      .parse(request.body);
    return abTests.pickWinner(body.variants, body.minImpressions);
  });

  return app;
}

export function createDefaultQueue(redisUrl = "redis://localhost:6379") {
  return new Queue("ai-ecommerce-jobs", {
    connection: {
      url: redisUrl
    }
  });
}

export { createIdempotencyKey };
export * from "./workers/order-fulfillment.js";

function mockDashboard() {
  return {
    metrics: {
      todayOrders: { label: "Today orders", value: 238, delta: 12 },
      todaySales: { label: "Today GMV", value: 128600, delta: 8 },
      activeProducts: { label: "Active products", value: 1860, delta: 3 },
      profit: { label: "Profit", value: 32600, delta: 5 }
    },
    salesTrend: mockSalesTrend(),
    pendingOrders: mockOrders().slice(0, 2),
    inventoryAlerts: mockProducts().slice(0, 2)
  };
}

function mockProducts() {
  return [
    {
      id: "prod-1",
      image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7",
      title: "Portable desk fan",
      platform: "douyin",
      price: 69,
      cost: 28,
      stock: 168,
      status: "active",
      links: { douyin: "douyin-prod-1", pdd: "pdd-prod-1" },
      category: "summer",
      updatedAt: new Date().toISOString()
    },
    {
      id: "prod-2",
      image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64",
      title: "Dorm storage box",
      platform: "pdd",
      price: 39,
      cost: 14,
      stock: 42,
      status: "active",
      links: { pdd: "pdd-prod-2", taobao: "taobao-prod-2" },
      category: "education",
      updatedAt: new Date().toISOString()
    }
  ];
}

function mockOrders() {
  return [
    {
      id: "order-1",
      platform: "douyin",
      buyer: "Buyer A",
      phone: "[REDACTED]",
      address: "[REDACTED]",
      productTitle: "Portable desk fan",
      amount: 138,
      profit: 48,
      status: "paid",
      createdAt: new Date().toISOString(),
      timeline: [
        {
          status: "paid",
          at: new Date().toISOString(),
          description: "Payment received."
        }
      ]
    },
    {
      id: "order-2",
      platform: "pdd",
      buyer: "Buyer B",
      phone: "[REDACTED]",
      address: "[REDACTED]",
      productTitle: "Dorm storage box",
      amount: 78,
      profit: 28,
      status: "sourcing",
      createdAt: new Date().toISOString(),
      timeline: [
        {
          status: "sourcing",
          at: new Date().toISOString(),
          description: "Supplier order is being prepared."
        }
      ]
    }
  ];
}

function mockSourcing() {
  return {
    trend: mockSalesTrend(),
    keywords: [
      { keyword: "mini fan", searchVolume: 88000, growth: 32 },
      { keyword: "back to school", searchVolume: 64000, growth: 24 }
    ],
    results: [
      {
        id: "source-1",
        image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7",
        title: "Portable desk fan",
        price: 28,
        monthlySales: 8400,
        supplier: "Yiwu Supplier A",
        score: 88,
        profitMargin: 0.41,
        stock: 6000,
        tags: ["summer", "trend"],
        details: {
          priceCompetitiveness: 82,
          supplierReliability: 86,
          productQuality: 78,
          fulfillmentCapability: 92,
          profitMargin: 80,
          trendTimeliness: 91
        }
      }
    ]
  };
}

function mockAnalytics() {
  return {
    salesTrend: mockSalesTrend(),
    productRanking: [
      { title: "Portable desk fan", sales: 1200, revenue: 82800 },
      { title: "Dorm storage box", sales: 860, revenue: 33540 }
    ],
    platformShare: [
      { platform: "douyin", value: 45 },
      { platform: "pdd", value: 35 },
      { platform: "taobao", value: 20 }
    ],
    profitReport: mockSalesTrend().map((point) => ({
      date: point.date,
      revenue: point.total,
      cost: point.total - point.profit,
      profit: point.profit
    }))
  };
}

function mockSalesTrend() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const douyin = 18000 + index * 1500;
    const pdd = 12000 + index * 900;
    const taobao = 8000 + index * 700;
    const total = douyin + pdd + taobao;
    return {
      date,
      douyin,
      pdd,
      taobao,
      total,
      profit: Math.round(total * 0.24)
    };
  });
}
