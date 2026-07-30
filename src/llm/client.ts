import type {
  CompletionRequest,
  CompletionResponse,
  CompletionMessage,
  ProviderId,
  ProviderError,
} from "./types";
import { findProvider } from "./config";
import { trackModelUsage } from "../telemetry/tracker";

export async function complete(
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const provider = findProvider(req.model);
  if (!provider) {
    throw new Error(`No provider configured for model: ${req.model}`);
  }

  switch (provider.id) {
    case "openai":
      return completeOpenAI(provider, req);
    case "anthropic":
      return completeAnthropic(provider, req);
    case "deepseek":
      return completeDeepSeek(provider, req);
    case "openrouter":
      return completeOpenRouter(provider, req);
    default:
      return completeOpenAI(provider, req);
  }
}

function toProviderError(err: unknown, provider: ProviderId): ProviderError {
  if (err instanceof ResponseError) return err.toProviderError(provider);
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
    if (this.status === 429) {
      return { type: "rate_limit", message: this.message, provider, retryable: true };
    }
    if (this.status === 401) {
      return { type: "auth", message: this.message, provider, retryable: false };
    }
    if (this.status >= 500) {
      return { type: "server_error", message: this.message, provider, retryable: true };
    }
    return { type: "unknown", message: this.message, provider, retryable: false };
  }
}

async function completeOpenAI(
  provider: { apiKey: string; baseUrl: string },
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model: req.model,
    messages: req.messages.map(simplifyMessage),
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 200,
    stream: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ResponseError(res.status, `OpenAI ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
  };

  trackModelUsage(req.model, data.usage.total_tokens);

  return {
    model: data.model,
    content: data.choices[0]?.message?.content ?? "",
    usage: {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
    provider: "openai",
  };
}

async function completeAnthropic(
  provider: { apiKey: string; baseUrl: string },
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/messages`;

  const systemMsg = req.messages.find((m) => m.role === "system");
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user" as const, content: m.content }));

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? 200,
    messages,
  };
  if (systemMsg) body.system = systemMsg.content;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ResponseError(res.status, `Anthropic ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content: { text: string }[];
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  const totalTokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  trackModelUsage(req.model, totalTokens);

  return {
    model: data.model,
    content: data.content?.map((c) => c.text).join("") ?? "",
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      totalTokens,
    },
    provider: "anthropic",
  };
}

async function completeDeepSeek(
  provider: { apiKey: string; baseUrl: string },
  req: CompletionRequest,
): Promise<CompletionResponse> {
  return completeOpenAI(provider, req);
}

async function completeOpenRouter(
  provider: { apiKey: string; baseUrl: string },
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model: req.model,
    messages: req.messages.map(simplifyMessage),
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 200,
    stream: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      "HTTP-Referer": "https://github.com/metateam-code-agent",
      "X-Title": "MetaTeam Code Agent",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ResponseError(res.status, `OpenRouter ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
  };

  trackModelUsage(req.model, data.usage.total_tokens);

  return {
    model: data.model,
    content: data.choices[0]?.message?.content ?? "",
    usage: {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
    provider: "openrouter",
  };
}

function simplifyMessage(msg: CompletionMessage): { role: string; content: string } {
  return { role: msg.role, content: msg.content };
}
