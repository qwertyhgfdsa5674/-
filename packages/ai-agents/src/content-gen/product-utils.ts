import type { ProductDetail } from "@ai-ecommerce/platform-alibaba1688";

import type { SpecTable } from "./types.js";

export function productName(product: ProductDetail): string {
  return cleanText(product.title);
}

export function minPrice(product: ProductDetail): number {
  const prices = [
    ...product.priceLevels.map((level) => level.price),
    ...product.skus.map((sku) => sku.price)
  ].filter((price) => Number.isFinite(price) && price >= 0);

  return prices.length > 0 ? Math.min(...prices) : 0;
}

export function sellingPoints(product: ProductDetail): string[] {
  const specs = Object.entries(product.specs)
    .slice(0, 4)
    .map(([key, value]) => `${key}${formatSpecValue(value)}`);
  const skuSpecs = product.skus.slice(0, 3).map((sku) => sku.spec);
  const descriptionPoints = product.description
    .split(/[，。,.;；\n]/)
    .map((part) => cleanText(part))
    .filter((part) => part.length >= 2)
    .slice(0, 3);

  return unique([...descriptionPoints, ...specs, ...skuSpecs]).slice(0, 5);
}

export function specTable(product: ProductDetail): SpecTable {
  const specs: SpecTable = {};

  Object.entries(product.specs).forEach(([key, value]) => {
    specs[key] = formatSpecValue(value);
  });

  if (product.skus.length > 0) {
    specs["可选规格"] = unique(product.skus.map((sku) => sku.spec)).join(" / ");
  }

  const stock = product.skus.reduce((total, sku) => total + sku.stock, 0);
  if (stock > 0) {
    specs["现货库存"] = `${stock}件`;
  }

  return specs;
}

export function bestKeywords(
  product: ProductDetail,
  hotKeywords: string[],
  limit: number
): string[] {
  const titleTokens = product.title
    .split(/[\s/|,，。]+/)
    .map((token) => cleanText(token))
    .filter((token) => token.length >= 2);

  return unique([...hotKeywords, ...titleTokens]).slice(0, limit);
}

export function cleanText(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundRatio(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

export function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  values.forEach((value) => {
    const normalized = cleanText(value);

    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized);
      output.push(normalized);
    }
  });

  return output;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSpecValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(" / ");
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return value === undefined ? "" : String(value);
}
