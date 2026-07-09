import type { ComplianceChecker } from "./types.js";

export class ContentComplianceChecker implements ComplianceChecker {
  private readonly prohibitedTerms: string[];

  public constructor(
    prohibitedTerms: string[] = [
      "国家级",
      "第一",
      "最",
      "全网",
      "独家",
      "顶级",
      "极品",
      "首选",
      "唯一",
      "绝对",
      "最高级",
      "极致",
      "全国第一",
      "全球首发",
      "史无前例",
      "万能",
      "永不",
      "特效",
      "纯天然",
      "百分百",
      "彻底",
      "立刻见效"
    ]
  ) {
    this.prohibitedTerms = prohibitedTerms;
  }

  public sanitize(text: string): string {
    return this.prohibitedTerms.reduce((current, term) => {
      return current.replaceAll(term, replacementFor(term));
    }, text);
  }

  public sanitizeList(values: string[]): string[] {
    return values.map((value) => this.sanitize(value));
  }
}

function replacementFor(term: string): string {
  const replacements: Record<string, string> = {
    最: "",
    第一: "领先",
    国家级: "高标准",
    全网: "多平台",
    独家: "特有",
    顶级: "优质",
    极品: "精品",
    首选: "推荐",
    唯一: "少数",
    绝对: "相当",
    最高级: "高级",
    极致: "出色",
    全国第一: "广受认可",
    全球首发: "新品上市",
    史无前例: "难得的",
    万能: "多用途",
    永不: "持久",
    特效: "有效",
    纯天然: "天然",
    百分百: "高比例",
    彻底: "深度",
    立刻见效: "快速起效"
  };

  return replacements[term] ?? "";
}
