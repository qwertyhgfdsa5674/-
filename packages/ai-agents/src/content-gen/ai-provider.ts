import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

import type {
  AiGenerationRequest,
  AiGenerationResult,
  ContentAiProvider,
  TokenUsage
} from "./types.js";

export class OpenAiAnthropicContentProvider implements ContentAiProvider {
  public constructor(
    private readonly clients: {
      openai?: OpenAI;
      anthropic?: Anthropic;
    }
  ) {}

  public async generateJson<T>(
    request: AiGenerationRequest
  ): Promise<AiGenerationResult<T>> {
    if (request.provider === "openai") {
      return this.generateWithOpenAi<T>(request);
    }

    return this.generateWithAnthropic<T>(request);
  }

  private async generateWithOpenAi<T>(
    request: AiGenerationRequest
  ): Promise<AiGenerationResult<T>> {
    if (!this.clients.openai) {
      throw new Error("OpenAI client is not configured.");
    }

    const response = await this.clients.openai.chat.completions.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${request.system}\n请只返回合法 JSON。` },
        { role: "user", content: request.user }
      ]
    });
    const content = response.choices[0]?.message.content ?? "{}";

    return {
      data: parseJson<T>(content),
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens
      }
    };
  }

  private async generateWithAnthropic<T>(
    request: AiGenerationRequest
  ): Promise<AiGenerationResult<T>> {
    if (!this.clients.anthropic) {
      throw new Error("Anthropic client is not configured.");
    }

    const response = await this.clients.anthropic.messages.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens ?? 1000,
      system: `${request.system}\n请只返回合法 JSON。`,
      messages: [{ role: "user", content: request.user }]
    });
    const contentBlock = response.content.find((block: unknown) =>
      isTextContentBlock(block)
    );
    const text = contentBlock?.text ?? "{}";

    return {
      data: parseJson<T>(text),
      usage: mapAnthropicUsage(response.usage)
    };
  }
}

export function parseJson<T>(text: string): T {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }

    throw new Error("AI provider returned invalid JSON.");
  }
}

function mapAnthropicUsage(
  usage: { input_tokens?: number; output_tokens?: number } | undefined
): Partial<TokenUsage> {
  const promptTokens = usage?.input_tokens;
  const completionTokens = usage?.output_tokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens:
      promptTokens !== undefined || completionTokens !== undefined
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : undefined
  };
}

function isTextContentBlock(
  value: unknown
): value is { type: "text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "text" in value &&
    value.type === "text" &&
    typeof value.text === "string"
  );
}
