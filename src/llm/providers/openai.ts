import type { CompletionRequest, CompletionResponse, StreamDelta } from "../types";
import type { ProviderAdapter } from "./types";
import { findModel } from "../config";
import { trackModelUsage } from "../../telemetry/tracker";
import { LlmError } from "../../utils/errors";
import type { ProviderId } from "../types";

class ResponseError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toOpenAIMessages(messages: CompletionRequest["messages"]): Record<string, unknown>[] {
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

function toOpenAITools(tools: CompletionRequest["tools"]): Record<string, unknown>[] {
  if (!tools) return [];
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function buildBody(req: CompletionRequest, providerId: string): Record<string, unknown> {
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
  if (req.reasoning) {
    body.reasoning_effort = "high";
  }
  return body;
}

function buildHeaders(providerId: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (providerId === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/metateam-code-agent";
    headers["X-Title"] = "MetaTeam Code Agent";
  }
  return headers;
}

function parseUsage(data: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }): {
  inputTokens: number; outputTokens: number; totalTokens: number;
} {
  return {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
}

function parseToolCalls(message: { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }): {
  id: string; name: string; arguments: string;
}[] {
  return (message.tool_calls ?? []).map((tc) => ({
    id: tc.id ?? "",
    name: tc.function?.name ?? "",
    arguments: tc.function?.arguments ?? "{}",
  }));
}

export function createOpenAiCompatibleProvider(opts: {
  id: string;
  baseUrl: string;
  apiKey: string;
}): ProviderAdapter {
  const { id, baseUrl, apiKey } = opts;

  return {
    id,
    async complete(req) {
      const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(id, apiKey),
        body: JSON.stringify(buildBody(req, id)),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ResponseError(res.status, `${id} ${res.status}: ${text}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
      };
      const usage = parseUsage(data);
      trackModelUsage(req.model, usage.totalTokens);
      const message = data.choices?.[0]?.message;
      const toolCalls = message?.tool_calls?.length ? parseToolCalls(message) : [];
      return {
        model: data.model ?? req.model,
        content: message?.content ?? "",
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          reasoningTokens: 0,
          totalTokens: usage.totalTokens,
        },
        provider: id as ProviderId,
      };
    },
    async stream(req, onDelta) {
      const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(id, apiKey),
        body: JSON.stringify({ ...buildBody(req, id), stream: true }),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ResponseError(res.status, `${id} ${res.status}: ${text}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error(`${id}: stream body unavailable`);
      const decoder = new TextDecoder();
      let buffer = "";
      const acc = new OpenAIStreamAccumulator(onDelta);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) acc.flushLine(line);
      }
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) acc.flushLine(line);
      }
      acc.finalize();
      const totalTokens = acc.usage?.total_tokens ?? 0;
      if (totalTokens) trackModelUsage(req.model, totalTokens);
      return {
        model: req.model,
        content: acc.content,
        ...(acc.toolCalls.length > 0 ? { toolCalls: acc.toolCalls } : {}),
        usage: {
          inputTokens: acc.usage?.prompt_tokens ?? 0,
          outputTokens: acc.usage?.completion_tokens ?? 0,
          reasoningTokens: 0,
          totalTokens,
        },
        provider: id as ProviderId,
      };
    },
  };
}

export class OpenAIStreamAccumulator {
  content = "";
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
  toolCalls: { id: string; name: string; arguments: string }[] = [];
  private toolCallsById = new Map<string, { id: string; name: string; args: string }>();
  private toolCallOrder: string[] = [];

  constructor(private onDelta: (delta: StreamDelta) => void) {}

  flushLine(line: string): void {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let data: {
      choices?: Array<{
        delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
        finish_reason?: string | null;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }
    if (data.usage) this.usage = data.usage;
    const delta = data.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) {
      this.content += delta.content;
      this.onDelta({ kind: "text", text: delta.content });
    }
    for (const tc of delta.tool_calls ?? []) {
      const id = tc.id ?? this.toolCallOrder[tc.index] ?? `tc_${tc.index}`;
      let entry = this.toolCallsById.get(id);
      if (!entry) {
        entry = { id, name: tc.function?.name ?? "", args: "" };
        this.toolCallsById.set(id, entry);
        this.toolCallOrder[tc.index] = id;
      }
      if (tc.function?.name && !entry.name) entry.name = tc.function.name;
      if (tc.function?.arguments) entry.args += tc.function.arguments;
    }
  }

  finalize(): void {
    this.toolCalls = this.toolCallOrder
      .map((id) => this.toolCallsById.get(id))
      .filter((t): t is { id: string; name: string; args: string } => !!t && !!t.name)
      .map((t) => ({ id: t.id, name: t.name, arguments: t.args || "{}" }));
  }
}
