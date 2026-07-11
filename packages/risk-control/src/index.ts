import { createHash } from "node:crypto";
import { z } from "zod";

export const ComplianceInputSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  category: z.string().min(1),
  priceCents: z.number().int().positive(),
  marketAvgPriceCents: z.number().int().positive().optional(),
  authorizedBrands: z.array(z.string()).default([]),
  imageOcrText: z.string().default(""),
  targetPlatform: z.string().min(1)
});
export type ComplianceInput = z.infer<typeof ComplianceInputSchema>;

export interface ComplianceIssue {
  severity: "blocker" | "major" | "minor";
  type: "forbidden_keyword" | "brand_authorization" | "price" | "category";
  message: string;
}

export interface ComplianceResult {
  productId: string;
  passed: boolean;
  issues: ComplianceIssue[];
  contentHash: string;
}

const FORBIDDEN_KEYWORDS = ["counterfeit", "replica", "fake", "medical cure"];
const BRAND_WORDS = ["nike", "adidas", "apple", "dyson", "xiaomi"];

export class ComplianceScanner {
  public scan(input: ComplianceInput): ComplianceResult {
    const parsed = ComplianceInputSchema.parse(input);
    const text =
      `${parsed.title} ${parsed.description} ${parsed.imageOcrText}`.toLowerCase();
    const issues: ComplianceIssue[] = [];

    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (text.includes(keyword)) {
        issues.push({
          severity: "blocker",
          type: "forbidden_keyword",
          message: `Forbidden keyword detected: ${keyword}`
        });
      }
    }

    for (const brand of BRAND_WORDS) {
      if (text.includes(brand) && !parsed.authorizedBrands.includes(brand)) {
        issues.push({
          severity: "major",
          type: "brand_authorization",
          message: `Brand term requires authorization: ${brand}`
        });
      }
    }

    if (
      parsed.marketAvgPriceCents &&
      parsed.priceCents > parsed.marketAvgPriceCents * 3
    ) {
      issues.push({
        severity: "major",
        type: "price",
        message: "Price exceeds three times market average."
      });
    }

    return {
      productId: parsed.productId,
      passed: issues.every((issue) => issue.severity === "minor"),
      issues,
      contentHash: createHash("sha256")
        .update(JSON.stringify(parsed))
        .digest("hex")
    };
  }
}

export class ExchangeRateRiskMonitor {
  public shouldReprice(args: {
    previousRate: number;
    currentRate: number;
    thresholdRate?: number;
  }): boolean {
    const threshold = args.thresholdRate ?? 0.03;
    const change =
      Math.abs(args.currentRate - args.previousRate) / args.previousRate;
    return change >= threshold;
  }
}
