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
import { findProvider, findModel } from "./config";
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
  providerId: ProviderId = "openai",
): Promise<CompletionResponse> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: req.model,
    messages: toOpenAIMessages(req.messages),
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? findModel(req.model)?.maxTokens ?? 4096,
    stream: false,
  };
  if (req.tools?.length) {
    body.tools = toOpenAITools(req.tools);
    body.tool_choice = req.toolChoice ?? "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ResponseError(res.status, `OpenAI ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: { name: string; arguments?: string };
        }>;
      };
    }[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model?: string;
  };

  const totalTokens = data.usage?.total_tokens ?? 0;
  trackModelUsage(req.model, totalTokens);

  const message = data.choices?.[0]?.message;
  const toolCalls: ToolCallInfo[] = (message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments ?? "{}",
  }));

  return {
    model: data.model ?? req.model,
    content: message?.content ?? "",
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      totalTokens,
    },
    provider: providerId,
  };
}

async function completeAnthropic(
  provider: { apiKey: string; baseUrl: string },
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/messages`;

  const systemMsg = req.messages.find((m) => m.role === "system");
  const messages = toAnthropicMessages(req.messages);

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? findModel(req.model)?.maxTokens ?? 4096,
    messages,
  };
  if (systemMsg) body.system = systemMsg.content;
  if (req.tools?.length) {
    body.tools = toAnthropicTools(req.tools);
    body.tool_choice = toAnthropicToolChoice(req.toolChoice ?? "auto");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ResponseError(res.status, `Anthropic ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  };

  const totalTokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  trackModelUsage(req.model, totalTokens);

  let content = "";
  const toolCalls: ToolCallInfo[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text") {
      content += block.text ?? "";
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id ?? "",
        name: block.name ?? "",
        arguments: JSON.stringify(block.input ?? {}),
      });
    }
  }

  return {
    model: data.model ?? req.model,
    content,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
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
  return completeOpenAI(provider, req, "deepseek");
}

async function completeOpenRouter(
  provider: { apiKey: string; baseUrl: string },
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: req.model,
    messages: toOpenAIMessages(req.messages),
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? findModel(req.model)?.maxTokens ?? 4096,
    stream: false,
  };
  if (req.tools?.length) {
    body.tools = toOpenAITools(req.tools);
    body.tool_choice = req.toolChoice ?? "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      "HTTP-Referer": "https://github.com/metateam-code-agent",
      "X-Title": "MetaTeam Code Agent",
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ResponseError(res.status, `OpenRouter ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: { name: string; arguments?: string };
        }>;
      };
    }[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model?: string;
  };

  const totalTokens = data.usage?.total_tokens ?? 0;
  trackModelUsage(req.model, totalTokens);

  const message = data.choices?.[0]?.message;
  const toolCalls: ToolCallInfo[] = (message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments ?? "{}",
  }));

  return {
    model: data.model ?? req.model,
    content: message?.content ?? "",
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      totalTokens,
    },
    provider: "openrouter",
  };
}

function toOpenAIMessages(messages: CompletionMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId ?? "",
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function toOpenAITools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toAnthropicMessages(messages: CompletionMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: Record<string, unknown>[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: safeParseArguments(tc.arguments),
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (m.role === "tool") {
      const block: Record<string, unknown> = {
        type: "tool_result",
        tool_use_id: m.toolCallId ?? "",
        content: m.content,
      };
      const last = out[out.length - 1];
      if (
        last &&
        last.role === "user" &&
        Array.isArray(last.content) &&
        (last.content[last.content.length - 1] as { type?: string } | undefined)?.type === "tool_result"
      ) {
        (last.content as Record<string, unknown>[]).push(block);
        continue;
      }
      out.push({ role: "user", content: [block] });
      continue;
    }

    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function toAnthropicTools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function toAnthropicToolChoice(choice: ToolChoice): string | Record<string, unknown> {
  if (choice === "auto") return "auto";
  if (choice === "none") return { type: "none" };
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.function.name };
}

function safeParseArguments(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return { input: json };
  }
}
