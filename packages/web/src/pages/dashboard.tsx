import {
  AlertTriangle,
  ArrowUpRight,
  PackageCheck,
  ShoppingCart,
  Wallet
} from "lucide-react";

import { SalesTrendChart } from "../components/charts/chart-card";
import { PageShell } from "../components/layout/page-shell";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/state";
import { Td, Th, Table } from "../components/ui/table";
import { useDashboard } from "../hooks/use-commerce-data";
import {
  formatCurrency,
  formatNumber,
  platformLabel,
  statusLabel
} from "../lib/utils";

const metricIcons = [ShoppingCart, Wallet, PackageCheck, ArrowUpRight];

export function DashboardPage() {
  const query = useDashboard();

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  if (!query.data) return <EmptyState />;

  const metrics = Object.values(query.data.metrics);

  return (
    <PageShell
      title="仪表盘"
      description="多平台经营概览、待处理事项和库存风险。"
    >
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metricIcons[index] ?? ArrowUpRight;
          const isMoney =
            metric.label.includes("金额") || metric.label.includes("利润");
          return (
            <Card key={metric.label}>
              <CardHeader>
                <div>
                  <p className="text-sm text-[rgb(var(--muted-foreground))]">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {isMoney
                      ? formatCurrency(metric.value)
                      : formatNumber(metric.value)}
                  </p>
                </div>
                <Icon className="h-5 w-5 text-[rgb(var(--primary))]" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-600 dark:text-emerald-300">
                    较昨日 +{Math.round(metric.delta * 100)}%
                  </span>
                  {metric.platformBreakdown ? (
                    <span className="text-[rgb(var(--muted-foreground))]">
                      {metric.platformBreakdown
                        .map(
                          (item) =>
                            `${platformLabel[item.platform]} ${formatNumber(item.value)}`
                        )
                        .join(" / ")}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>近 7 天销售趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={query.data.salesTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>库存预警</CardTitle>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {query.data.inventoryAlerts.map((product) => (
                <div key={product.id} className="flex items-center gap-3">
                  <img
                    src={product.image}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {product.title}
                    </p>
                    <p className="text-xs text-[rgb(var(--muted-foreground))]">
                      {platformLabel[product.platform]}
                    </p>
                  </div>
                  <Badge tone={product.stock === 0 ? "danger" : "warning"}>
                    {product.stock} 件
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>待处理订单</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>订单</Th>
                <Th>平台</Th>
                <Th>商品</Th>
                <Th>金额</Th>
                <Th>状态</Th>
                <Th>时间</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.pendingOrders.map((order) => (
                <tr key={order.id}>
                  <Td className="font-medium">{order.id}</Td>
                  <Td>{platformLabel[order.platform]}</Td>
                  <Td>{order.productTitle}</Td>
                  <Td>{formatCurrency(order.amount)}</Td>
                  <Td>
                    <Badge tone={order.status === "failed" ? "danger" : "info"}>
                      {statusLabel[order.status]}
                    </Badge>
                  </Td>
                  <Td className="text-[rgb(var(--muted-foreground))]">
                    {order.createdAt}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
