import type {
  CompletionRequest,
  CompletionResponse,
  CompletionMessage,
  ProviderId,
  ProviderError,
  ToolCallInfo,
  ToolChoice,
  ToolDefinition,
} from "./types";
import { findProvider, findProviderById, findModel } from "./config";
import { trackModelUsage } from "../telemetry/tracker";
import { LlmError, IncompleteResponseError } from "../utils/errors";
import { createOpenAiCompatibleProvider, createAnthropicProvider } from "./providers";
import type { ProviderAdapter } from "./providers/types";

export type ProviderFactory = (opts: {
  id: string;
  baseUrl: string;
  apiKey: string;
}) => ProviderAdapter;

const providerFactories = new Map<string, ProviderFactory>();

function openAiCompatibleFactory(opts: { id: string; baseUrl: string; apiKey: string }): ProviderAdapter {
  return createOpenAiCompatibleProvider(opts);
}

function anthropicFactory(opts: { id: string; baseUrl: string; apiKey: string }): ProviderAdapter {
  return createAnthropicProvider({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
}

registerProviderFactory("anthropic", anthropicFactory);
registerProviderFactory("openai", openAiCompatibleFactory);
registerProviderFactory("deepseek", openAiCompatibleFactory);
registerProviderFactory("openrouter", openAiCompatibleFactory);
registerProviderFactory("llamacpp", openAiCompatibleFactory);

export function registerProviderFactory(providerId: string, factory: ProviderFactory): void {
  providerFactories.set(providerId, factory);
}

const providers = new Map<string, ProviderAdapter>();

function getOrCreateProvider(providerId: string): ProviderAdapter {
  let p = providers.get(providerId);
  if (p) return p;
  const provider = findProviderById(providerId);
  if (!provider) throw new Error(`No provider configured: ${providerId}`);
  const factory =
    providerFactories.get(provider.id) ?? providerFactories.get("openai") ?? openAiCompatibleFactory;
  p = factory({ id: provider.id, baseUrl: provider.baseUrl, apiKey: provider.apiKey });
  providers.set(providerId, p);
  return p;
}

export async function complete(
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const provider = findProvider(req.model);
  if (!provider) throw new Error(`No provider configured for model: ${req.model}`);
  const p = getOrCreateProvider(provider.id);
  return p.complete(req);
}

export type StreamDelta =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; toolCall: ToolCallInfo };

export async function completeStream(
  req: CompletionRequest,
  onDelta: (delta: StreamDelta) => void,
): Promise<CompletionResponse> {
  const provider = findProvider(req.model);
  if (!provider) throw new Error(`No provider configured for model: ${req.model}`);
  const p = getOrCreateProvider(provider.id);
  return p.stream(req, onDelta);
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

async function withRetry<T>(
  providerId: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error("Request aborted");
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err instanceof ResponseError ? err.status : undefined;
      const retryable = status !== undefined ? RETRYABLE_STATUSES.has(status) : false;
      if (!retryable || attempt >= MAX_RETRIES) break;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  if (lastError instanceof ResponseError) {
    throw LlmError.fromStatus(providerId, lastError.status, lastError.message);
  }
  if (lastError instanceof Error) {
    throw new LlmError(lastError.message, { provider: providerId, retryable: false });
  }
  throw new LlmError(String(lastError), { provider: providerId, retryable: false });
}

function toProviderError(err: unknown, provider: ProviderId): ProviderError {
  if (err instanceof ResponseError) return err.toProviderError(provider);
  if (err instanceof LlmError) {
    return {
      type: err.retryable ? "server_error" : "unknown",
      message: err.message,
      provider,
      retryable: err.retryable,
    };
  }
  return {
    type: "unknown",
    message: err instanceof Error ? err.message : String(err),
    provider,
    retryable: false,
  };
}

class ResponseError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  toProviderError(provider: ProviderId): ProviderError {
    if (this.status === 429) return { type: "rate_limit", message: this.message, provider, retryable: true };
    if (this.status === 401) return { type: "auth", message: this.message, provider, retryable: false };
    if (this.status >= 500) return { type: "server_error", message: this.message, provider, retryable: true };
    return { type: "unknown", message: this.message, provider, retryable: false };
  }
}
