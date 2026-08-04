import type { CompletionRequest, CompletionResponse, StreamDelta } from "../types";
import type { ProviderAdapter } from "./types";
import { findModel } from "../config";
import { trackModelUsage } from "../../telemetry/tracker";
import { LlmError } from "../../utils/errors";

class ResponseError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toAnthropicMessages(messages: CompletionRequest["messages"]): Record<string, unknown>[] {
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

function toAnthropicTools(tools: CompletionRequest["tools"]): Record<string, unknown>[] {
  if (!tools) return [];
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function toAnthropicToolChoice(choice: CompletionRequest["toolChoice"]): string | Record<string, unknown> {
  if (!choice) return "auto";
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

export function createAnthropicProvider(opts: {
  baseUrl: string;
  apiKey: string;
}): ProviderAdapter {
  const { baseUrl, apiKey } = opts;

  return {
    id: "anthropic",
    async complete(req) {
      const url = `${baseUrl.replace(/\/+$/, "")}/messages`;
      const systemMsg = req.messages.find((m) => m.role === "system");
      const body: Record<string, unknown> = {
        model: req.model,
        max_tokens: req.maxTokens ?? findModel(req.model)?.maxTokens ?? 4096,
        messages: toAnthropicMessages(req.messages),
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
          "x-api-key": apiKey,
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
        content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
      };
      const totalTokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      trackModelUsage(req.model, totalTokens);
      let content = "";
      const toolCalls: { id: string; name: string; arguments: string }[] = [];
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
          reasoningTokens: 0,
          totalTokens,
        },
        provider: "anthropic",
      };
    },
    async stream(req, onDelta) {
      const url = `${baseUrl.replace(/\/+$/, "")}/messages`;
      const systemMsg = req.messages.find((m) => m.role === "system");
      const body: Record<string, unknown> = {
        model: req.model,
        max_tokens: req.maxTokens ?? findModel(req.model)?.maxTokens ?? 4096,
        messages: toAnthropicMessages(req.messages),
        stream: true,
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
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ResponseError(res.status, `Anthropic ${res.status}: ${text}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Anthropic: stream body unavailable");
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let model = req.model;
      const toolCalls: { id: string; name: string; arguments: string }[] = [];
      let currentTool: { id: string; name: string; args: string } | null = null;
      const flushEvent = (event: string) => {
        if (!event.startsWith("event:")) return;
        const lines = event.split("\n");
        const type = lines[0].slice(6).trim();
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!dataLine) return;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dataLine.slice(5).trim());
        } catch {
          return;
        }
        if (type === "message_start") {
          const m = data.message as { model?: string; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
          if (m) {
            if (m.model) model = m.model;
            if (m.usage) {
              inputTokens = m.usage.input_tokens ?? 0;
              outputTokens = m.usage.output_tokens ?? 0;
            }
          }
          return;
        }
        if (type === "content_block_start") {
          const block = data.content_block as { type?: string; id?: string; name?: string } | undefined;
          if (block?.type === "tool_use") {
            currentTool = { id: block.id ?? "", name: block.name ?? "", args: "" };
          }
          return;
        }
        if (type === "content_block_delta") {
          const delta = data.delta as { type?: string; text?: string; partial_json?: string } | undefined;
          if (delta?.type === "text_delta" && delta.text) {
            content += delta.text;
            onDelta({ kind: "text", text: delta.text });
          } else if (delta?.type === "input_json_delta" && currentTool && delta.partial_json) {
            currentTool.args += delta.partial_json;
          }
          return;
        }
        if (type === "content_block_stop") {
          if (currentTool) {
            toolCalls.push({
              id: currentTool.id,
              name: currentTool.name,
              arguments: currentTool.args || "{}",
            });
            currentTool = null;
          }
          return;
        }
        if (type === "message_delta") {
          const usage = data.usage as { output_tokens?: number } | undefined;
          if (usage?.output_tokens) outputTokens = usage.output_tokens;
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) flushEvent(ev);
      }
      if (buffer.trim()) flushEvent(buffer);
      const totalTokens = inputTokens + outputTokens;
      if (totalTokens) trackModelUsage(req.model, totalTokens);
      return {
        model,
        content,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        usage: { inputTokens, outputTokens, reasoningTokens: 0, totalTokens },
        provider: "anthropic",
      };
    },
  };
}
