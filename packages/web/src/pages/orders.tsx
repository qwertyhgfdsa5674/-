import * as Dialog from "@radix-ui/react-dialog";
import { Truck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { Order, OrderStatus } from "../api/types";
import { PageShell } from "../components/layout/page-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/state";
import { Td, Th, Table } from "../components/ui/table";
import { useOrders } from "../hooks/use-commerce-data";
import { cn, formatCurrency, platformLabel, statusLabel } from "../lib/utils";

const statusTabs: Array<OrderStatus | "all"> = [
  "all",
  "pending",
  "sourcing",
  "purchasing",
  "shipped",
  "completed",
  "aftersale",
  "failed"
];

export function OrdersPage() {
  const query = useOrders();
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [selected, setSelected] = useState<Order | null>(null);

  const orders = useMemo(() => {
    return (query.data ?? []).filter(
      (order) => status === "all" || order.status === status
    );
  }, [query.data, status]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  return (
    <PageShell
      title="订单管理"
      description="跟踪订单履约、物流回填和售后处理。"
    >
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((item) => (
              <button
                type="button"
                key={item}
                className={cn(
                  "h-9 rounded-md px-3 text-sm",
                  item === status
                    ? "bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]"
                    : "bg-[rgb(var(--muted))] text-[rgb(var(--muted-foreground))]"
                )}
                onClick={() => setStatus(item)}
              >
                {item === "all" ? "全部" : statusLabel[item]}
              </button>
            ))}
          </div>

          {orders.length === 0 ? (
            <EmptyState title="暂无该状态订单" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>订单</Th>
                  <Th>平台</Th>
                  <Th>买家</Th>
                  <Th>商品</Th>
                  <Th>金额</Th>
                  <Th>物流</Th>
                  <Th>状态</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <Td className="font-medium">{order.id}</Td>
                    <Td>{platformLabel[order.platform]}</Td>
                    <Td>{order.buyer}</Td>
                    <Td>{order.productTitle}</Td>
                    <Td>{formatCurrency(order.amount)}</Td>
                    <Td>{order.trackingNumber ?? "待回填"}</Td>
                    <Td>
                      <Badge
                        tone={
                          order.status === "failed"
                            ? "danger"
                            : order.status === "shipped"
                              ? "success"
                              : "info"
                        }
                      >
                        {statusLabel[order.status]}
                      </Badge>
                    </Td>
                    <Td className="space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(order)}
                      >
                        详情
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast.success("已提交手动发货")}
                      >
                        <Truck className="h-4 w-4" />
                        发货
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast.success("已标记售后")}
                      >
                        <Wrench className="h-4 w-4" />
                        售后
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <OrderDrawer order={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}

function OrderDrawer({
  order,
  onClose
}: {
  order: Order | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={Boolean(order)}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-[460px] overflow-y-auto border-l border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl">
          {order ? (
            <div className="space-y-5">
              <Dialog.Title className="text-lg font-semibold">
                订单详情 · {order.id}
              </Dialog.Title>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="买家" value={order.buyer} />
                <Info label="手机" value={order.phone} />
                <Info label="金额" value={formatCurrency(order.amount)} />
                <Info label="利润" value={formatCurrency(order.profit)} />
              </div>
              <Info label="地址" value={order.address} />
              <Info label="商品" value={order.productTitle} />
              <Info
                label="物流"
                value={
                  order.trackingNumber
                    ? `${order.logisticsCompany ?? ""} ${order.trackingNumber}`
                    : "待发货"
                }
              />
              <div>
                <p className="mb-3 text-sm font-medium">状态时间线</p>
                <div className="space-y-3">
                  {order.timeline.map((item) => (
                    <div
                      key={`${item.status}-${item.at}`}
                      className="border-l-2 border-[rgb(var(--primary))] pl-3"
                    >
                      <p className="text-sm font-medium">{item.status}</p>
                      <p className="text-xs text-[rgb(var(--muted-foreground))]">
                        {item.at} · {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
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
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
