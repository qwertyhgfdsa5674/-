import type { ProductDetail } from "@ai-ecommerce/platform-alibaba1688";
import { describe, expect, it } from "vitest";

import {
  DailyTokenBudgetController,
  DescriptionGenerator,
  ImageCaptionGenerator,
  InMemoryContentGenerationCache,
  PromptTemplateManager,
  TitleGenerator,
  type ContentAiProvider,
  type GeneratedTitle
} from "../src/content-gen/index.js";

const product: ProductDetail = {
  id: "cup-1",
  title: "ins风不锈钢保温杯 学生便携水杯",
  description: "316不锈钢内胆，长效保温，多色可选，杯盖防漏。",
  images: [
    "https://example.com/cup-1.jpg",
    "https://example.com/cup-2.jpg",
    "https://example.com/cup-3.jpg"
  ],
  skus: [
    {
      spec: "白色 500ml",
      price: 19.9,
      stock: 120
    },
    {
      spec: "绿色 500ml",
      price: 19.9,
      stock: 80
    }
  ],
  priceLevels: [
    {
      minQty: 1,
      price: 19.9
    },
    {
      minQty: 100,
      price: 15.8
    }
  ],
  specs: {
    材质: "316不锈钢",
    容量: "500ml",
    颜色: "白色/绿色"
  }
};

describe("content generation pipeline", () => {
  it("generates platform-aware title variants and sanitizes prohibited terms", async () => {
    const generator = new TitleGenerator();
    const titles = await generator.generate(
      product,
      "douyin",
      ["学生党", "保温杯"],
      {
        count: 3
      }
    );

    expect(titles).toHaveLength(3);
    expect(titles.every((title) => title.platform === "douyin")).toBe(true);
    expect(titles[0]?.text).toMatch(/冲|疯了|火/);
    expect(
      titles.every(
        (title) => title.estimatedCTR >= 0 && title.estimatedCTR <= 1
      )
    ).toBe(true);
    expect(titles.map((title) => title.text).join("")).not.toContain("最");
  });

  it("returns cached output for identical title inputs", async () => {
    const cache = new InMemoryContentGenerationCache();
    const aiProvider = createCountingTitleProvider();
    const generator = new TitleGenerator({ cache, aiProvider });

    await generator.generate(product, "pdd", ["低价"], { count: 1 });
    await generator.generate(product, "pdd", ["低价"], { count: 1 });

    expect(aiProvider.calls).toBe(1);
  });

  it("generates a full product description with html and markdown", async () => {
    const generator = new DescriptionGenerator();
    const description = await generator.generate(product, "taobao");

    expect(description.sellingPoints.length).toBeGreaterThanOrEqual(3);
    expect(description.specs["材质"]).toBe("316不锈钢");
    expect(description.html).toContain("<section");
    expect(description.markdown).toContain("## 核心卖点");
  });

  it("generates image overlay copy from product context", async () => {
    const generator = new ImageCaptionGenerator();
    const caption = await generator.generate(product.images[0]!, product);

    expect(caption.overlayText).toContain("15.8");
    expect(caption.position).toBe("bottom");
    expect(caption.style).toBe("price_tag");
  });

  it("loads and renders YAML prompt templates", async () => {
    const manager = new PromptTemplateManager();
    const template = await manager.loadTemplate("title-douyin");
    const rendered = await manager.render(template, {
      count: 2,
      keywords: ["保温杯"],
      productName: product.title,
      sellingPoints: ["防漏"],
      price: 19.9
    });

    expect(template.name).toBe("title-douyin");
    expect(rendered).toContain("保温杯");
    expect(rendered).toContain(product.title);
  });

  it("enforces token budgets before provider calls", async () => {
    const generator = new TitleGenerator({
      aiProvider: createCountingTitleProvider(),
      budget: new DailyTokenBudgetController({ maxTokensPerRequest: 10 })
    });

    await expect(
      generator.generate(product, "douyin", ["保温杯"], { count: 3 })
    ).rejects.toThrow(/Token request budget exceeded/);
  });
});

function createCountingTitleProvider(): ContentAiProvider & { calls: number } {
  return {
    calls: 0,
    async generateJson<T>() {
      this.calls += 1;
      const titles: GeneratedTitle[] = [
        {
          text: "10万+人已买！同款第一低价",
          platform: "pdd",
          strategy: "price",
          keywords: ["低价"],
          estimatedCTR: 0.12
        }
      ];

      return {
        data: { titles } as T,
        usage: {
          promptTokens: 20,
          completionTokens: 10,
          totalTokens: 30
        }
      };
    }
  };
}
