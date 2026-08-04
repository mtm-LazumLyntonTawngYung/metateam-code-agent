import { loadConfig, saveConfig } from "../config";
import { KNOWN_MODELS, type ModelConfig, type ProviderConfig, type ProviderId } from "./types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const MODELS_CACHE_PATH = join(homedir(), ".config", "mtc", "models.json");
const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type LlmConfig = {
  providers: ProviderConfig[];
  routing: {
    simpleModel: string;
    defaultModel: string;
    reasoningModel: string;
    reasoningEnabled: boolean;
  };
};
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat"],
  },
  {
    id: "openai",
    label: "OpenAI",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    apiKey: "",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-20250514", "claude-haiku-3-5-20241022"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["anthropic/claude-sonnet-4", "anthropic/claude-3.5-haiku", "openai/gpt-4o", "openai/gpt-4o-mini", "google/gemini-2.0-flash-001", "deepseek/deepseek-chat", "poolside/laguna-s-2.1:free"],
  },
  {
    id: "llamacpp",
    label: "Local Llama",
    apiKey: "",
    baseUrl: "http://localhost:8080/v1",
    models: ["qwen2.5-7b-instruct", "qwen2.5-1.5b-instruct", "qwen2.5-1.5b-instruct-q4_0", "qwen2.5-1.5b-instruct-q8_0"],
  },
];

const CONFIG_KEY = "llm";

export function loadLlmConfig(): LlmConfig {
  const cfg = loadConfig();
  const raw = (cfg as Record<string, unknown>)[CONFIG_KEY] as Partial<LlmConfig> | undefined;

  const defaults = DEFAULT_PROVIDERS.map((p) => ({ ...p, models: [...p.models] }));
  if (raw?.providers?.length) {
    for (const saved of raw.providers) {
      const existing = defaults.find((p) => p.id === saved.id);
      if (existing) {
        existing.models = [...new Set([...(existing.models ?? []), ...(saved.models ?? [])])];
        if (saved.apiKey) existing.apiKey = saved.apiKey;
        if (saved.baseUrl) existing.baseUrl = saved.baseUrl;
        if (saved.label) existing.label = saved.label;
      } else {
        defaults.push({ ...saved });
      }
    }
  }

  return {
    providers: defaults,
    routing: raw?.routing ?? {
      simpleModel: "deepseek-chat",
      defaultModel: "deepseek-chat",
      reasoningModel: "claude-sonnet-4-20250514",
      reasoningEnabled: false,
    },
  };
}

export function saveLlmConfig(partial: Partial<LlmConfig>): LlmConfig {
  const current = loadLlmConfig();
  const merged: LlmConfig = {
    providers: partial.providers ?? current.providers,
    routing: { ...current.routing, ...partial.routing },
  };
  saveConfig({ llm: merged as unknown as Record<string, unknown> });
  return merged;
}

export function updateProvider(provider: ProviderConfig): LlmConfig {
  const cfg = loadLlmConfig();
  const idx = cfg.providers.findIndex((p) => p.id === provider.id);
  if (idx >= 0) {
    cfg.providers[idx] = provider;
  } else {
    cfg.providers.push(provider);
  }
  return saveLlmConfig({ providers: cfg.providers });
}

export function getConfiguredModelIds(): string[] {
  const cfg = loadLlmConfig();
  const ids: string[] = [];
  for (const p of cfg.providers) {
    ids.push(...p.models);
  }
  return ids;
}

export function filterKnownModels(configuredIds: string[]): ModelConfig[] {
  const ids = new Set(configuredIds);
  return getAllKnownModels().filter((m) => ids.has(m.id));
}

export function findModel(id: string) {
  return getAllKnownModels().find((m) => m.id === id);
}

export function findProvider(modelId: string): ProviderConfig | undefined {
  const cfg = loadLlmConfig();
  return cfg.providers.find((p) => p.models.includes(modelId));
}

export function getAllKnownModels(): ModelConfig[] {
  const cached = readModelsCache();
  if (cached.length > 0) return cached;
  return KNOWN_MODELS;
}

export function readModelsCache(): ModelConfig[] {
  try {
    if (!existsSync(MODELS_CACHE_PATH)) return [];
    const raw = readFileSync(MODELS_CACHE_PATH, "utf-8");
    const data = JSON.parse(raw) as { models?: ModelConfig[]; updatedAt?: number };
    if (!data.models || !Array.isArray(data.models)) return [];
    if (data.updatedAt && Date.now() - data.updatedAt > MODELS_CACHE_TTL_MS) return [];
    return data.models;
  } catch {
    return [];
  }
}

export function writeModelsCache(models: ModelConfig[]): void {
  try {
    const dir = join(homedir(), ".config", "mtc");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(MODELS_CACHE_PATH, JSON.stringify({ models, updatedAt: Date.now() }, null, 2), "utf-8");
  } catch {
    // ignore cache write errors
  }
}

export async function refreshModels(): Promise<{ added: number; total: number }> {
  try {
    const res = await fetch("https://models.dev/api/v1/models", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`models.dev responded ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const providerMap: Record<string, ProviderId> = {
      openai: "openai",
      anthropic: "anthropic",
      deepseek: "deepseek",
      google: "openrouter",
      meta: "openrouter",
      mistral: "openrouter",
      cohere: "openrouter",
      amazon: "openrouter",
      xai: "openrouter",
    };
    const supported = new Set(Object.keys(providerMap));
    const models: ModelConfig[] = [];
    const seen = new Set<string>();
    for (const [id, info] of Object.entries(data as Record<string, { provider?: string; pricing?: { prompt?: string; completion?: string }; context_length?: number }>)) {
      if (seen.has(id)) continue;
      const rawProvider = info.provider ?? "";
      if (!supported.has(rawProvider)) continue;
      const provider = providerMap[rawProvider] ?? "openrouter";
      const promptPrice = parsePrice(info.pricing?.prompt);
      const completionPrice = parsePrice(info.pricing?.completion);
      const ctx = info.context_length ?? 4096;
      models.push({
        id,
        displayName: id.split("/").pop() ?? id,
        provider,
        tier: "default",
        costPer1kInput: promptPrice,
        costPer1kOutput: completionPrice,
        maxTokens: Math.min(Math.max(ctx, 4096), 32768),
        contextWindow: ctx,
      });
      seen.add(id);
    }
    writeModelsCache(models);
    return { added: models.length, total: models.length };
  } catch {
    return { added: 0, total: 0 };
  }
}

function parsePrice(value: unknown): number {
  if (typeof value !== "string") return 0;
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

