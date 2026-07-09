import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";

export const AgentKindSchema = z.enum([
  "trend-analysis",
  "product-selection",
  "content-generation"
]);

export type AgentKind = z.infer<typeof AgentKindSchema>;

export interface AiAgentClients {
  openai: OpenAI;
  anthropic: Anthropic;
}

export function createAiAgentClients(config: {
  openaiApiKey: string;
  anthropicApiKey: string;
}): AiAgentClients {
  return {
    openai: new OpenAI({ apiKey: config.openaiApiKey }),
    anthropic: new Anthropic({ apiKey: config.anthropicApiKey })
  };
}

export * from "./product-scorer/index.js";
