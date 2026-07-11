import { useState } from "react";

import {
  PlatformPieChart,
  ProfitBarChart,
  SalesTrendChart
} from "../components/charts/chart-card";
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
import { useAnalytics } from "../hooks/use-commerce-data";
import { cn, formatCurrency, formatNumber, platformLabel } from "../lib/utils";

const ranges = [
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" }
] as const;

export function AnalyticsPage() {
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const query = useAnalytics(range);

  if (query.isLoading) return <LoadingState />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data) return <EmptyState />;

  return (
    <PageShell
      title="数据分析"
      description="销售额、利润、商品排行和平台结构分析。"
      action={
        <div className="flex rounded-md border border-[rgb(var(--border))] p-1">
          {ranges.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                "h-8 rounded px-4 text-sm",
                range === item.value
                  ? "bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]"
                  : "text-[rgb(var(--muted-foreground))]"
              )}
              onClick={() => setRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-[1.4fr_0.8fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>销售额趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={query.data.salesTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>平台对比</CardTitle>
          </CardHeader>
          <CardContent>
            <PlatformPieChart data={query.data.platformShare} />
            <div className="mt-3 flex justify-center gap-3">
              {query.data.platformShare.map((item) => (
                <Badge key={item.platform}>
                  {platformLabel[item.platform]} {item.value}%
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>利润报表</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfitBarChart data={query.data.profitReport} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>商品销量排行</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>商品</Th>
                  <Th>销量</Th>
                  <Th>销售额</Th>
                </tr>
              </thead>
              <tbody>
                {query.data.productRanking.map((item, index) => (
                  <tr key={item.title}>
                    <Td>
                      <span className="mr-2 text-[rgb(var(--muted-foreground))]">
                        #{index + 1}
                      </span>
                      {item.title}
                    </Td>
                    <Td>{formatNumber(item.sales)}</Td>
                    <Td>{formatCurrency(item.revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
