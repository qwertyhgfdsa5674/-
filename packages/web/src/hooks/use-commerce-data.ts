import { useQuery } from "@tanstack/react-query";

import { getJson } from "../api/client";
import type {
  AnalyticsData,
  DashboardData,
  Order,
  Product,
  SourcingData
} from "../api/types";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getJson<DashboardData>("/api/dashboard")
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => getJson<Product[]>("/api/products")
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => getJson<Order[]>("/api/orders")
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
