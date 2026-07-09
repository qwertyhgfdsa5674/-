import { subDays, format } from "date-fns";

import type {
  AnalyticsData,
  DashboardData,
  Order,
  Product,
  SourcingData
} from "../api/types";

const day = (offset: number) =>
  format(subDays(new Date("2026-07-10"), offset), "MM-dd");

export const products: Product[] = [
  {
    id: "p-1001",
    image:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=160&q=80",
    title: "316不锈钢保温杯 学生便携水杯",
    platform: "pdd",
    price: 39,
    cost: 18,
    stock: 420,
    status: "active",
    category: "日用百货",
    updatedAt: "2026-07-10 09:20",
    links: {
      pdd: "https://mobile.yangkeduo.com",
      taobao: "https://taobao.com"
    }
  },
  {
    id: "p-1002",
    image:
      "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=160&q=80",
    title: "轻量透气运动鞋 通勤跑步两用",
    platform: "douyin",
    price: 129,
    cost: 62,
    stock: 38,
    status: "active",
    category: "鞋服",
    updatedAt: "2026-07-10 08:45",
    links: {
      douyin: "https://fxg.jinritemai.com"
    }
  },
  {
    id: "p-1003",
    image:
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=160&q=80",
    title: "便携化妆刷套装 新手全套",
    platform: "taobao",
    price: 59,
    cost: 24,
    stock: 12,
    status: "active",
    category: "美妆",
    updatedAt: "2026-07-09 22:10",
    links: {
      taobao: "https://taobao.com"
    }
  },
  {
    id: "p-1004",
    image:
      "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=160&q=80",
    title: "桌面收纳盒 多格透明抽屉",
    platform: "pdd",
    price: 29,
    cost: 11,
    stock: 0,
    status: "paused",
    category: "家居",
    updatedAt: "2026-07-09 18:30",
    links: {
      pdd: "https://mobile.yangkeduo.com",
      douyin: "https://fxg.jinritemai.com"
    }
  },
  {
    id: "p-1005",
    image:
      "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=160&q=80",
    title: "复古偏光太阳镜 小脸显瘦款",
    platform: "taobao",
    price: 49,
    cost: 16,
    stock: 86,
    status: "draft",
    category: "配饰",
    updatedAt: "2026-07-09 15:12",
    links: {
      taobao: "https://taobao.com",
      douyin: "https://fxg.jinritemai.com"
    }
  },
  {
    id: "p-1006",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=160&q=80",
    title: "厚底增高休闲鞋 百搭情侣款",
    platform: "douyin",
    price: 159,
    cost: 76,
    stock: 7,
    status: "active",
    category: "鞋服",
    updatedAt: "2026-07-08 20:00",
    links: {
      douyin: "https://fxg.jinritemai.com"
    }
  }
];

export const orders: Order[] = [
  {
    id: "o-9001",
    platform: "pdd",
    buyer: "林女士",
    phone: "138****2210",
    address: "上海市浦东新区",
    productTitle: "316不锈钢保温杯",
    amount: 78,
    profit: 42,
    status: "pending",
    createdAt: "2026-07-10 10:12",
    timeline: [
      { status: "已支付", at: "10:12", description: "订单支付成功" },
      { status: "待配货", at: "10:13", description: "等待自动匹配货源" }
    ]
  },
  {
    id: "o-9002",
    platform: "douyin",
    buyer: "周先生",
    phone: "139****5521",
    address: "杭州市滨江区",
    productTitle: "轻量透气运动鞋",
    amount: 129,
    profit: 67,
    status: "sourcing",
    createdAt: "2026-07-10 09:44",
    timeline: [
      { status: "已支付", at: "09:44", description: "订单支付成功" },
      { status: "配货中", at: "09:45", description: "正在匹配 1688 供应商" }
    ]
  },
  {
    id: "o-9003",
    platform: "taobao",
    buyer: "王女士",
    phone: "137****0188",
    address: "成都市锦江区",
    productTitle: "便携化妆刷套装",
    amount: 59,
    profit: 35,
    status: "shipped",
    trackingNumber: "YT82910293",
    logisticsCompany: "圆通速递",
    createdAt: "2026-07-10 08:22",
    timeline: [
      { status: "已支付", at: "08:22", description: "订单支付成功" },
      { status: "已发货", at: "09:10", description: "物流单号已回填" }
    ]
  },
  {
    id: "o-9004",
    platform: "pdd",
    buyer: "赵先生",
    phone: "136****7881",
    address: "深圳市南山区",
    productTitle: "桌面收纳盒",
    amount: 58,
    profit: 36,
    status: "failed",
    createdAt: "2026-07-09 23:51",
    timeline: [
      { status: "已支付", at: "23:51", description: "订单支付成功" },
      { status: "异常", at: "00:04", description: "供应商库存不足" }
    ]
  },
  {
    id: "o-9005",
    platform: "douyin",
    buyer: "陈女士",
    phone: "135****3320",
    address: "苏州市工业园区",
    productTitle: "复古偏光太阳镜",
    amount: 98,
    profit: 66,
    status: "purchasing",
    createdAt: "2026-07-09 22:18",
    timeline: [
      { status: "已支付", at: "22:18", description: "订单支付成功" },
      { status: "采购中", at: "22:20", description: "正在向供应商下单" }
    ]
  }
];

export const salesTrend = Array.from({ length: 7 }, (_, index) => {
  const offset = 6 - index;
  const douyin = 8200 + index * 620;
  const pdd = 6400 + index * 540;
  const taobao = 5200 + index * 420;
  const total = douyin + pdd + taobao;
  return {
    date: day(offset),
    douyin,
    pdd,
    taobao,
    total,
    profit: Math.round(total * 0.34)
  };
});

export const dashboard: DashboardData = {
  metrics: {
    todayOrders: {
      label: "今日订单",
      value: 286,
      delta: 0.18,
      platformBreakdown: [
        { platform: "douyin", value: 92 },
        { platform: "pdd", value: 124 },
        { platform: "taobao", value: 70 }
      ]
    },
    todaySales: {
      label: "今日金额",
      value: 34860,
      delta: 0.12,
      platformBreakdown: [
        { platform: "douyin", value: 12800 },
        { platform: "pdd", value: 14320 },
        { platform: "taobao", value: 7740 }
      ]
    },
    activeProducts: { label: "在售商品", value: 1284, delta: 0.07 },
    profit: { label: "今日利润", value: 11820, delta: 0.16 }
  },
  salesTrend,
  pendingOrders: orders.slice(0, 5),
  inventoryAlerts: products.filter((product) => product.stock <= 40).slice(0, 5)
};

export const sourcing: SourcingData = {
  trend: salesTrend,
  keywords: [
    { keyword: "防晒冰袖", searchVolume: 82000, growth: 0.42 },
    { keyword: "学生保温杯", searchVolume: 68000, growth: 0.31 },
    { keyword: "桌面收纳", searchVolume: 54000, growth: 0.27 },
    { keyword: "通勤运动鞋", searchVolume: 49000, growth: 0.22 },
    { keyword: "化妆刷套装", searchVolume: 41000, growth: 0.18 },
    { keyword: "偏光太阳镜", searchVolume: 38000, growth: 0.15 }
  ],
  results: [
    {
      id: "s-1",
      image:
        "https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=240&q=80",
      title: "夏季防晒冰袖 男女通用",
      price: 6.8,
      monthlySales: 180000,
      supplier: "义乌清凉日用品厂",
      score: 91,
      profitMargin: 0.48,
      stock: 50000,
      tags: ["高搜索", "低客单", "夏季"],
      details: {
        priceCompetitiveness: 92,
        supplierReliability: 86,
        productQuality: 82,
        fulfillmentCapability: 90,
        profitMargin: 88
      }
    },
    {
      id: "s-2",
      image:
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=240&q=80",
      title: "高颜值学生保温杯 500ml",
      price: 18.9,
      monthlySales: 92000,
      supplier: "永康水具工厂",
      score: 88,
      profitMargin: 0.41,
      stock: 26000,
      tags: ["开学季", "多色", "复购"],
      details: {
        priceCompetitiveness: 84,
        supplierReliability: 90,
        productQuality: 88,
        fulfillmentCapability: 86,
        profitMargin: 80
      }
    },
    {
      id: "s-3",
      image:
        "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=240&q=80",
      title: "透明桌面收纳盒 多格抽屉",
      price: 10.6,
      monthlySales: 76000,
      supplier: "台州家居供应链",
      score: 84,
      profitMargin: 0.45,
      stock: 18000,
      tags: ["家居", "低退货", "拼单"],
      details: {
        priceCompetitiveness: 86,
        supplierReliability: 82,
        productQuality: 78,
        fulfillmentCapability: 80,
        profitMargin: 85
      }
    }
  ]
};

export const analytics: AnalyticsData = {
  salesTrend,
  productRanking: [
    { title: "保温杯", sales: 3240, revenue: 126360 },
    { title: "运动鞋", sales: 1840, revenue: 237360 },
    { title: "化妆刷", sales: 1520, revenue: 89680 },
    { title: "收纳盒", sales: 1310, revenue: 37990 },
    { title: "太阳镜", sales: 980, revenue: 48020 }
  ],
  platformShare: [
    { platform: "douyin", value: 42 },
    { platform: "pdd", value: 36 },
    { platform: "taobao", value: 22 }
  ],
  profitReport: salesTrend.map((point) => ({
    date: point.date,
    revenue: point.total,
    cost: point.total - point.profit,
    profit: point.profit
  }))
};
