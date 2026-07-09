import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

import YAML from "yaml";

import type { PromptTemplate } from "./types.js";

const DEFAULT_TEMPLATE_DIR = fileURLToPath(
  new URL("./templates", import.meta.url)
);

export class PromptTemplateManager {
  public constructor(private readonly templateDir = DEFAULT_TEMPLATE_DIR) {}

  public async loadTemplate(name: string): Promise<PromptTemplate> {
    const raw = await this.readTemplateFile(name);
    const parsed = YAML.parse(raw) as unknown;

    return parsePromptTemplate(parsed, name);
  }

  public async render(
    template: PromptTemplate,
    variables: Record<string, unknown>
  ): Promise<string> {
    return [
      renderText(template.system, variables),
      "",
      renderText(template.user, variables)
    ].join("\n");
  }

  private async readTemplateFile(name: string): Promise<string> {
    const filename = `${name}.yaml`;

    try {
      return await readFile(join(this.templateDir, filename), "utf8");
    } catch (error) {
      const sourcePath = join(
        process.cwd(),
        "packages",
        "ai-agents",
        "src",
        "content-gen",
        "templates",
        filename
      );

      try {
        return await readFile(sourcePath, "utf8");
      } catch {
        throw error;
      }
    }
  }
}

function parsePromptTemplate(
  value: unknown,
  requestedName: string
): PromptTemplate {
  if (!isRecord(value)) {
    throw new Error(`Prompt template ${requestedName} must be a YAML object.`);
  }

  const name = readString(value, "name", requestedName);

  return {
    name,
    model: readString(value, "model", "claude-sonnet-5"),
    temperature: readNumber(value, "temperature", 0.7),
    system: readString(value, "system", ""),
    user: readString(value, "user", "")
  };
}

function renderText(text: string, variables: Record<string, unknown>): string {
  return text.replaceAll(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = variables[key];

    if (Array.isArray(value)) {
      return value.join("、");
    }

    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }

    return value === undefined ? "" : String(value);
  });
}

function readString(
  record: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = record[key];
  return typeof value === "number" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
