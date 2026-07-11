export type Platform = "douyin" | "pdd" | "taobao";
export type ProductStatus = "active" | "draft" | "paused";
export type OrderStatus =
  | "pending"
  | "sourcing"
  | "purchasing"
  | "shipped"
  | "completed"
  | "aftersale"
  | "failed";

export interface MetricCard {
  label: string;
  value: number;
  delta: number;
  platformBreakdown?: Array<{ platform: Platform; value: number }>;
}

export interface SalesPoint {
  date: string;
  douyin: number;
  pdd: number;
  taobao: number;
  total: number;
  profit: number;
}

export interface Product {
  id: string;
  image: string;
  title: string;
  platform: Platform;
  price: number;
  cost: number;
  stock: number;
  status: ProductStatus;
  links: Partial<Record<Platform, string>>;
  category: string;
  updatedAt: string;
}

export interface OrderTimelineItem {
  status: string;
  at: string;
  description: string;
}

export interface Order {
  id: string;
  platform: Platform;
  buyer: string;
  phone: string;
  address: string;
  productTitle: string;
  amount: number;
  profit: number;
  status: OrderStatus;
  trackingNumber?: string;
  logisticsCompany?: string;
  createdAt: string;
  timeline: OrderTimelineItem[];
}

export interface SourcingProduct {
  id: string;
  image: string;
  title: string;
  price: number;
  monthlySales: number;
  supplier: string;
  score: number;
  profitMargin: number;
  stock: number;
  tags: string[];
  details: {
    priceCompetitiveness: number;
    supplierReliability: number;
    productQuality: number;
    fulfillmentCapability: number;
    profitMargin: number;
  };
}

export interface KeywordTrend {
  keyword: string;
  searchVolume: number;
  growth: number;
}

export interface DashboardData {
  metrics: {
    todayOrders: MetricCard;
    todaySales: MetricCard;
    activeProducts: MetricCard;
    profit: MetricCard;
  };
  salesTrend: SalesPoint[];
  pendingOrders: Order[];
  inventoryAlerts: Product[];
}

export interface SourcingData {
  trend: SalesPoint[];
  keywords: KeywordTrend[];
  results: SourcingProduct[];
}

export interface AnalyticsData {
  salesTrend: SalesPoint[];
  productRanking: Array<{ title: string; sales: number; revenue: number }>;
  platformShare: Array<{ platform: Platform; value: number }>;
  profitReport: Array<{
    date: string;
    revenue: number;
    cost: number;
    profit: number;
  }>;
}

export interface DataHealthTable {
  table: string;
  status: "ok" | "empty" | "missing" | "error";
  rowCount: number | null;
  error?: string;
}

export interface DataHealth {
  sourceType: "database" | "mock";
  database: {
    configured: boolean;
    connected: boolean;
    status: "ok" | "unconfigured" | "error";
    error?: string;
  };
  tables: DataHealthTable[];
  summary: {
    emptyTables: number;
    missingTables: number;
    errorTables: number;
  };
}
