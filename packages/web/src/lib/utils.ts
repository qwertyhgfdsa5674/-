import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const platformLabel = {
  douyin: "抖音",
  pdd: "拼多多",
  taobao: "淘宝"
} as const;

export const statusLabel = {
  active: "在售",
  draft: "草稿",
  paused: "下架",
  pending: "待处理",
  sourcing: "配货中",
  purchasing: "采购中",
  shipped: "已发货",
  completed: "已完成",
  aftersale: "售后",
  failed: "异常"
} as const;
