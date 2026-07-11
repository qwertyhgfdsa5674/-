import { useQuery } from "@tanstack/react-query";

import { getJson } from "../api/client";
import type {
  AnalyticsData,
  DataHealth,
  DashboardData,
  Order,
  Product,
  SourcingData
} from "../api/types";

interface ProductsResponse {
  sourceType: "database" | "mock";
  products: Product[];
}

interface OrdersResponse {
  sourceType: "database" | "mock";
  orders: Order[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getJson<DashboardData>("/api/dashboard")
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const response = await getJson<Product[] | ProductsResponse>(
        "/api/products"
      );
      return Array.isArray(response) ? response : response.products;
    }
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const response = await getJson<Order[] | OrdersResponse>("/api/orders");
      return Array.isArray(response) ? response : response.orders;
    }
  });
}

export function useSourcing() {
  return useQuery({
    queryKey: ["sourcing"],
    queryFn: () => getJson<SourcingData>("/api/sourcing")
  });
}

export function useAnalytics(range: "day" | "week" | "month") {
  return useQuery({
    queryKey: ["analytics", range],
    queryFn: () => getJson<AnalyticsData>(`/api/analytics?range=${range}`)
  });
}

export function useDataHealth() {
  return useQuery({
    queryKey: ["data-health"],
    queryFn: () => getJson<DataHealth>("/api/diagnostics/data-health"),
    refetchInterval: 60_000,
    retry: 1
  });
}
