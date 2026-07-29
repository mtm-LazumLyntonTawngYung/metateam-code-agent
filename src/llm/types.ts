export type ProviderId = "openai" | "anthropic" | "deepseek" | "openrouter";

export type ModelTier = "fast" | "default" | "reasoning";

export type ModelConfig = {
  id: string;
  displayName: string;
  provider: ProviderId;
  tier: ModelTier;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxTokens: number;
  contextWindow: number;
};

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
};

export type CompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompletionRequest = {
  model: string;
  messages: CompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type CompletionResponse = {
  model: string;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  provider: ProviderId;
};

export type ProviderError = {
  type: "rate_limit" | "auth" | "timeout" | "server_error" | "unknown";
  message: string;
  provider: ProviderId;
  retryable: boolean;
};

export type TaskComplexity = "simple" | "medium" | "complex";

export type RoutingDecision = {
  model: ModelConfig;
  complexity: TaskComplexity;
  reason: string;
};

export const KNOWN_MODELS: ModelConfig[] = [
  {
    id: "deepseek-chat",
    displayName: "DeepSeek V4",
    provider: "deepseek",
    tier: "default",
    costPer1kInput: 0.00027,
    costPer1kOutput: 0.0011,
    maxTokens: 8192,
    contextWindow: 128000,
  },
  {
    id: "deepseek-chat",
    displayName: "DeepSeek Flash",
    provider: "deepseek",
    tier: "fast",
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00055,
    maxTokens: 4096,
    contextWindow: 64000,
  },
  {
    id: "gpt-4o",
    displayName: "GPT-4o",
    provider: "openai",
    tier: "default",
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
    maxTokens: 16384,
    contextWindow: 128000,
  },
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    provider: "openai",
    tier: "fast",
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    maxTokens: 16384,
    contextWindow: 128000,
  },
  {
    id: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    provider: "anthropic",
    tier: "reasoning",
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  {
    id: "claude-haiku-3-5-20241022",
    displayName: "Claude Haiku 3.5",
    provider: "anthropic",
    tier: "fast",
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    maxTokens: 8192,
    contextWindow: 200000,
  },
];

export const DEFAULT_ROUTING: Record<ModelTier, string[]> = {
  fast: ["deepseek-chat", "gpt-4o-mini", "claude-haiku-3-5-20241022"],
  default: ["deepseek-chat", "gpt-4o"],
  reasoning: ["claude-sonnet-4-20250514", "gpt-4o"],
};
