import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/layout/app-layout";
import { AnalyticsPage } from "./pages/analytics";
import { DashboardPage } from "./pages/dashboard";
import { OrdersPage } from "./pages/orders";
import { ProductsPage } from "./pages/products";
import { SourcingPage } from "./pages/sourcing";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/sourcing" element={<SourcingPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Route>
    </Routes>
  );
}
