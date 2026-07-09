import { http, HttpResponse } from "msw";

import { analytics, dashboard, orders, products, sourcing } from "./data";

export const handlers = [
  http.get("/api/dashboard", () => HttpResponse.json(dashboard)),
  http.get("/api/products", () => HttpResponse.json(products)),
  http.get("/api/orders", () => HttpResponse.json(orders)),
  http.get("/api/sourcing", () => HttpResponse.json(sourcing)),
  http.get("/api/analytics", () => HttpResponse.json(analytics))
];
