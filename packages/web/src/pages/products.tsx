import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, Layers, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { Platform, Product, ProductStatus } from "../api/types";
import { PageShell } from "../components/layout/page-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/state";
import { Td, Th, Table } from "../components/ui/table";
import { useProducts } from "../hooks/use-commerce-data";
import { cn, formatCurrency, platformLabel, statusLabel } from "../lib/utils";

const platforms: Array<Platform | "all"> = ["all", "douyin", "pdd", "taobao"];
const statuses: Array<ProductStatus | "all"> = [
  "all",
  "active",
  "draft",
  "paused"
];

export function ProductsPage() {
  const query = useProducts();
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [sort, setSort] = useState<"profit" | "stock" | "updated">("profit");
  const [selected, setSelected] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    return (query.data ?? [])
      .filter(
        (product) =>
          product.title.includes(search) || product.category.includes(search)
      )
      .filter((product) => platform === "all" || product.platform === platform)
      .filter((product) => status === "all" || product.status === status)
      .sort((left, right) => {
        if (sort === "stock") return left.stock - right.stock;
        if (sort === "updated")
          return right.updatedAt.localeCompare(left.updatedAt);
        return right.price - right.cost - (left.price - left.cost);
      });
  }, [platform, query.data, search, sort, status]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  return (
    <PageShell
      title="商品管理"
      description="集中管理多平台商品、库存、价格和铺货状态。"
      action={
        <Button onClick={() => toast.success("已创建铺货任务")}>
          <Layers className="h-4 w-4" />
          铺货到新平台
        </Button>
      }
    >
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="relative w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[rgb(var(--muted-foreground))]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索商品标题或类目"
                className="pl-9"
              />
            </div>
            <FilterGroup
              values={platforms}
              value={platform}
              onChange={setPlatform}
              label={(value) =>
                value === "all" ? "全部平台" : platformLabel[value]
              }
            />
            <FilterGroup
              values={statuses}
              value={status}
              onChange={setStatus}
              label={(value) =>
                value === "all" ? "全部状态" : statusLabel[value]
              }
            />
            <Button
              variant="outline"
              onClick={() =>
                setSort(
                  sort === "profit"
                    ? "stock"
                    : sort === "stock"
                      ? "updated"
                      : "profit"
                )
              }
            >
              <SlidersHorizontal className="h-4 w-4" />
              {sort === "profit"
                ? "按利润排序"
                : sort === "stock"
                  ? "按库存排序"
                  : "按更新排序"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.success("批量上架任务已提交")}
            >
              批量上架
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.success("批量下架任务已提交")}
            >
              批量下架
            </Button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="没有匹配的商品" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>商品</Th>
                  <Th>平台</Th>
                  <Th>价格</Th>
                  <Th>成本</Th>
                  <Th>利润</Th>
                  <Th>库存</Th>
                  <Th>状态</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image}
                          alt=""
                          className="h-11 w-11 rounded-md object-cover"
                        />
                        <div>
                          <p className="font-medium">{product.title}</p>
                          <p className="text-xs text-[rgb(var(--muted-foreground))]">
                            {product.category}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>{platformLabel[product.platform]}</Td>
                    <Td>{formatCurrency(product.price)}</Td>
                    <Td>{formatCurrency(product.cost)}</Td>
                    <Td className="text-emerald-600 dark:text-emerald-300">
                      {formatCurrency(product.price - product.cost)}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          product.stock <= 10
                            ? "danger"
                            : product.stock <= 40
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {product.stock}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          product.status === "active"
                            ? "success"
                            : product.status === "paused"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {statusLabel[product.status]}
                      </Badge>
                    </Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(product)}
                      >
                        详情
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProductDrawer product={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}

function FilterGroup<T extends string>({
  values,
  value,
  onChange,
  label
}: {
  values: T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
}) {
  return (
    <div className="flex rounded-md border border-[rgb(var(--border))] p-1">
      {values.map((item) => (
        <button
          key={item}
          className={cn(
            "h-8 rounded px-3 text-xs",
            item === value
              ? "bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]"
              : "text-[rgb(var(--muted-foreground))]"
          )}
          onClick={() => onChange(item)}
          type="button"
        >
          {label(item)}
        </button>
      ))}
    </div>
  );
}

function ProductDrawer({
  product,
  onClose
}: {
  product: Product | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={Boolean(product)}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-[420px] border-l border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl">
          {product ? (
            <div className="space-y-5">
              <Dialog.Title className="text-lg font-semibold">
                {product.title}
              </Dialog.Title>
              <img
                src={product.image}
                alt=""
                className="h-44 w-full rounded-lg object-cover"
              />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="平台" value={platformLabel[product.platform]} />
                <Info label="状态" value={statusLabel[product.status]} />
                <Info label="价格" value={formatCurrency(product.price)} />
                <Info label="成本" value={formatCurrency(product.cost)} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">平台链接</p>
                {Object.entries(product.links).map(([key, value]) => (
                  <a
                    key={key}
                    href={value}
                    className="flex items-center justify-between rounded-md border border-[rgb(var(--border))] px-3 py-2 text-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {platformLabel[key as Platform]}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={() => toast.success("铺货任务已进入队列")}
              >
                铺货到新平台
              </Button>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgb(var(--muted))] p-3">
      <p className="text-xs text-[rgb(var(--muted-foreground))]">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
