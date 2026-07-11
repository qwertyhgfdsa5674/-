import {
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  Package,
  Search,
  Server,
  ShoppingCart,
  Store,
  SunMoon,
  UserRound
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import type { DataHealth } from "../../api/types";
import { useDataHealth } from "../../hooks/use-commerce-data";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const navItems = [
  { label: "仪表盘", href: "/dashboard", icon: LayoutDashboard },
  { label: "商品", href: "/products", icon: Package },
  { label: "选品", href: "/sourcing", icon: Search },
  { label: "订单", href: "/orders", icon: ShoppingCart },
  { label: "数据", href: "/analytics", icon: BarChart3 }
];

export function AppLayout() {
  const dataHealth = useDataHealth();
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="flex min-h-screen min-w-[1024px] bg-[rgb(var(--background))]">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--card))]">
        <div className="flex h-16 items-center gap-3 border-b border-[rgb(var(--border))] px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI 电商运营</p>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              多平台管理后台
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                  isActive
                    ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
                    : "text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[rgb(var(--border))] p-4">
          <div className="rounded-md bg-[rgb(var(--muted))] p-3">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              今日自动履约
            </p>
            <p className="mt-1 text-xl font-semibold">238 单</p>
          </div>
        </div>
      </aside>

      <div className="ml-64 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--background))]/95 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <Button variant="outline" className="w-52 justify-between">
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                全店铺汇总
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <div className="hidden h-9 items-center rounded-md border border-[rgb(var(--border))] px-3 text-sm text-[rgb(var(--muted-foreground))] xl:flex">
              运营日期：2026-07-10
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone={healthTone(dataHealth.data, dataHealth.isError)}>
              <Server className="mr-1 h-3.5 w-3.5" />
              {healthLabel(
                dataHealth.data,
                dataHealth.isLoading,
                dataHealth.isError
              )}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDark((value) => !value)}
              aria-label="切换暗色模式"
            >
              <SunMoon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="通知">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="gap-2">
              <UserRound className="h-4 w-4" />
              运营主管
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function healthTone(health: DataHealth | undefined, isError: boolean) {
  if (isError || health?.database.status === "error") return "danger";
  if (!health || health.database.status === "unconfigured") return "warning";
  if (health.summary.errorTables > 0 || health.summary.missingTables > 0) {
    return "warning";
  }
  if (health.summary.emptyTables > 0) return "info";
  return "success";
}

function healthLabel(
  health: DataHealth | undefined,
  isLoading: boolean,
  isError: boolean
) {
  if (isLoading) return "Data check";
  if (isError) return "API down";
  if (!health) return "Unknown";
  if (health.database.status === "unconfigured") return "Mock mode";
  if (health.database.status === "error") return "DB error";
  if (health.summary.missingTables > 0) return "Schema missing";
  if (health.summary.emptyTables > 0) return "DB empty";
  return "DB ok";
}
