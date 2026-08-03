import { loadConfig, saveConfig } from "../config";
import { KNOWN_MODELS, type ModelConfig, type ProviderConfig, type ProviderId } from "./types";

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
  return KNOWN_MODELS.filter((m) => ids.has(m.id));
}

export function findModel(id: string) {
  return KNOWN_MODELS.find((m) => m.id === id);
}

export function findProvider(modelId: string): ProviderConfig | undefined {
  const cfg = loadLlmConfig();
  return cfg.providers.find((p) => p.models.includes(modelId));
}
