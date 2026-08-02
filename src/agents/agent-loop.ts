import { complete, completeStream } from "../llm/client";
import { executeTool, getToolSpecs } from "../tools/index";
import { addMessage, getMessages } from "../session/history";
import { buildContext, rotateIfNeeded } from "../session/summary";
import type { CompletionMessage, CompletionRequest, CompletionResponse, ToolCallInfo } from "../llm/types";
import type { AgentDefinition } from "./types";
import type { MessageRow } from "../session/history";
import type { ToolResult } from "../tools/schema";
import { loadConfig } from "../config";
import { findModel } from "../llm/config";
import { getEffectiveSystemPrompt } from "./index";

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type AgentUpdate =
  | { kind: "text"; content: string }
  | { kind: "stream"; content: string }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; toolCall: ToolCall; result: ToolResult }
  | { kind: "done"; content: string; toolCalls: number; duration: number; agentName: string; modelName: string }
  | { kind: "error"; error: string };

export const MAX_AGENT_ITERATIONS = 25;

export const DEFAULT_MAX_TOKENS = 4096;

export type RunAgentOptions = {
  executeToolFn?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
  modelId?: string;
  sessionId?: string;
  skillBody?: string;
  signal?: AbortSignal;
  stream?: boolean;
};

function wrapToolResult(toolName: string, result: ToolResult): string {
  const summary = result.success
    ? truncateResult(result.data)
    : `Error: ${result.error}`;
  return `IMPORTANT: Do not echo the raw tool output below. Use only what you need from it, then answer concisely in your own words.\n\nTool result from ${toolName}:\n${summary}`;
}

export function parseToolCallArguments(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { input: argumentsJson };
  }
}

function truncateResult(data: unknown, maxLen = 2000): string {
  if (data === null || data === undefined) return "(completed)";
  if (typeof data === "string") return data.length > maxLen ? data.slice(0, maxLen) + "\n... (truncated)" : data;
  const str = JSON.stringify(data);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "\n... (truncated)";
}

function systemPromptFor(agent: AgentDefinition, skillBody?: string): string {
  const effective = getEffectiveSystemPrompt(agent, skillBody);
  return `${effective}

You are an autonomous agent in a CLI environment. Be direct and terse:
- Never greet the user, never narrate your plans, never write "I will..." or "Let me...". Act, don't describe.
- For each request, immediately call the appropriate tool(s) and wait for the results before continuing.
- Prefer read_file and write_file directly when you already know the path. Use glob_files only to discover paths, with a targeted pattern.
- Once you have everything you need, answer the user's request concisely with the actual result.`;
}

function rowsToCompletionMessages(rows: MessageRow[]): CompletionMessage[] {
  const out: CompletionMessage[] = [];
  for (const row of rows) {
    if (row.role === "user" || row.role === "assistant" || row.role === "system") {
      if (row.content.trim()) {
        out.push({ role: row.role as CompletionMessage["role"], content: row.content });
      }
    }
  }
  return out;
}

export async function runAgentLoop(
  query: string,
  agent: AgentDefinition,
  history: CompletionMessage[],
  onUpdate: (update: AgentUpdate) => void,
  options: RunAgentOptions = {},
): Promise<string> {
  const { executeToolFn, modelId = "unknown", sessionId, skillBody, signal, stream = true } = options;
  const startTime = performance.now();
  let toolCalls = 0;
  const exec = executeToolFn ?? executeTool;

  if (sessionId) {
    addMessage(sessionId, "user", query);
  }

  const tools = getToolSpecs();
  const systemPrompt = systemPromptFor(agent, skillBody);

  let messages: CompletionMessage[];
  if (sessionId) {
    const ctx = buildContext(sessionId, systemPrompt);
    const rows = getMessages(sessionId, true);
    messages = [
      ...ctx.systemMessages.map((content) => ({ role: "system" as const, content })),
      ...rowsToCompletionMessages(rows),
      { role: "user", content: query },
    ];
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: query },
    ];
  }

  const buildRequest = (): CompletionRequest => ({
    model: modelId,
    messages,
    temperature: 0.7,
    maxTokens: findModel(modelId)?.maxTokens ?? DEFAULT_MAX_TOKENS,
    tools,
    toolChoice: "auto",
    signal,
  });

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    if (signal?.aborted) {
      const msg = "Agent aborted by user.";
      onUpdate({ kind: "error", error: msg });
      return msg;
    }

    if (sessionId) rotateIfNeeded(sessionId);

    let response: CompletionResponse;
    let streamedContent = "";
    try {
      const req = buildRequest();
      if (stream) {
        response = await completeStream(req, (delta) => {
          if (delta.kind === "text") {
            streamedContent += delta.text;
            onUpdate({ kind: "stream", content: streamedContent });
          }
        });
      } else {
        response = await complete(req);
      }
    } catch (err) {
      if (signal?.aborted) {
        const msg = "Agent aborted by user.";
        onUpdate({ kind: "error", error: msg });
        return msg;
      }
      const msg = err instanceof Error ? err.message : String(err);
      onUpdate({ kind: "error", error: msg });
      return `LLM call failed: ${msg}`;
    }

    const content = response.content;
    const callInfos: ToolCallInfo[] = response.toolCalls ?? [];
    const calls: ToolCall[] = callInfos.map((tc) => ({
      name: tc.name,
      args: parseToolCallArguments(tc.arguments),
    }));

    const assistantMsg: CompletionMessage = { role: "assistant", content };
    if (callInfos.length > 0) {
      assistantMsg.toolCalls = callInfos;
    }
    messages.push(assistantMsg);

    if (sessionId) {
      const persistedContent =
        content.trim() || (callInfos.length > 0 ? `[Calling: ${callInfos.map((c) => c.name).join(", ")}]` : "");
      addMessage(sessionId, "assistant", persistedContent);
    }

    if (calls.length === 0 && content.trim() && !streamedContent) {
      onUpdate({ kind: "text", content });
    }

    if (calls.length === 0) {
      const modelDisplayName = findModel(modelId)?.displayName ?? modelId;
      onUpdate({
        kind: "done",
        content,
        toolCalls,
        duration: Math.round(performance.now() - startTime),
        agentName: agent.name,
        modelName: modelDisplayName,
      });
      return content;
    }

    for (let i = 0; i < calls.length; i++) {
      const tc = calls[i];
      const callInfo = callInfos[i];
      toolCalls++;

      onUpdate({ kind: "tool_call", toolCall: tc });

      let result: ToolResult;
      try {
        result = await exec(tc.name, tc.args);
      } catch (err) {
        result = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      onUpdate({ kind: "tool_result", toolCall: tc, result });

      messages.push({
        role: "tool",
        content: wrapToolResult(tc.name, result),
        toolCallId: callInfo?.id,
      });

      if (sessionId) {
        addMessage(sessionId, "tool", wrapToolResult(tc.name, result), {
          tool_name: tc.name,
          tool_args: JSON.stringify(tc.args),
          tool_result: result.success ? truncateResult(result.data) : result.error,
        });
      }
    }
  }

  const msg = `Agent reached maximum of ${MAX_AGENT_ITERATIONS} iterations.`;
  onUpdate({ kind: "error", error: msg });
  return msg;
}
