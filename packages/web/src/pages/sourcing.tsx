import { CheckCircle2, ChevronDown, Rocket, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { SourcingProduct } from "../api/types";
import { SalesTrendChart } from "../components/charts/chart-card";
import { PageShell } from "../components/layout/page-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/state";
import { useSourcing } from "../hooks/use-commerce-data";
import { cn, formatCurrency, formatNumber, formatPercent } from "../lib/utils";

export function SourcingPage() {
  const query = useSourcing();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    return (query.data?.results ?? []).filter((item) =>
      selectedIds.includes(item.id)
    );
  }, [query.data?.results, selectedIds]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data) return <EmptyState />;

  const toggleSelected = (product: SourcingProduct) => {
    setSelectedIds((current) => {
      if (current.includes(product.id))
        return current.filter((id) => id !== product.id);
      if (current.length >= 4) {
        toast.error("最多选择 4 个商品对比");
        return current;
      }
      return [...current, product.id];
    });
  };

  return (
    <PageShell
      title="选品中心"
      description="结合搜索趋势、1688 供给和 AI 评分完成选品到铺货。"
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={selected.length === 0}
            onClick={() => toast.success("已确认选品")}
          >
            <CheckCircle2 className="h-4 w-4" />
            确认选品
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => toast.success("已生成商品内容并创建铺货任务")}
          >
            <Rocket className="h-4 w-4" />
            生成内容并铺货
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-[1.25fr_0.75fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>搜索量趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={query.data.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>热门关键词</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {query.data.keywords.map((keyword) => (
                <Badge
                  key={keyword.keyword}
                  tone={keyword.growth > 0.3 ? "success" : "info"}
                  className="px-3 py-2"
                >
                  {keyword.keyword} · {formatNumber(keyword.searchVolume)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {selected.length >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>商品对比</CardTitle>
            <span className="text-sm text-[rgb(var(--muted-foreground))]">
              {selected.length}/4
            </span>
          </CardHeader>
          <CardContent>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${selected.length}, minmax(0, 1fr))`
              }}
            >
              {selected.map((product) => (
                <div
                  key={product.id}
                  className="rounded-md border border-[rgb(var(--border))] p-4"
                >
                  <img
                    src={product.image}
                    alt=""
                    className="h-28 w-full rounded-md object-cover"
                  />
                  <p className="mt-3 line-clamp-2 font-medium">
                    {product.title}
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <Row label="评分" value={`${product.score}`} />
                    <Row label="供货价" value={formatCurrency(product.price)} />
                    <Row
                      label="月销量"
                      value={formatNumber(product.monthlySales)}
                    />
                    <Row
                      label="利润率"
                      value={formatPercent(product.profitMargin)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-4">
        {query.data.results.map((product) => {
          const checked = selectedIds.includes(product.id);
          const expanded = expandedId === product.id;
          return (
            <Card
              key={product.id}
              className={cn(checked && "ring-2 ring-[rgb(var(--primary))]")}
            >
              <CardContent className="space-y-4 pt-5">
                <img
                  src={product.image}
                  alt=""
                  className="h-36 w-full rounded-md object-cover"
                />
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{product.title}</p>
                    <Badge tone="success">{product.score}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
                    {product.supplier}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Mini label="供货价" value={formatCurrency(product.price)} />
                  <Mini
                    label="月销量"
                    value={formatNumber(product.monthlySales)}
                  />
                  <Mini
                    label="利润率"
                    value={formatPercent(product.profitMargin)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
                {expanded ? (
                  <div className="space-y-2 rounded-md bg-[rgb(var(--muted))] p-3 text-sm">
                    {Object.entries(product.details).map(([key, value]) => (
                      <Row
                        key={key}
                        label={scoreLabel[key] ?? key}
                        value={`${value}`}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setExpandedId(expanded ? null : product.id)}
                  >
                    <ChevronDown className="h-4 w-4" />
                    评分详情
                  </Button>
                  <Button
                    className="flex-1"
                    variant={checked ? "secondary" : "default"}
                    onClick={() => toggleSelected(product)}
                  >
                    <Sparkles className="h-4 w-4" />
                    {checked ? "已选择" : "加入对比"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}

const scoreLabel: Record<string, string> = {
  priceCompetitiveness: "价格竞争力",
  supplierReliability: "供应商可靠性",
  productQuality: "商品质量",
  fulfillmentCapability: "履约能力",
  profitMargin: "利润空间"
};

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgb(var(--muted))] p-2">
      <p className="text-xs text-[rgb(var(--muted-foreground))]">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[rgb(var(--muted-foreground))]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
