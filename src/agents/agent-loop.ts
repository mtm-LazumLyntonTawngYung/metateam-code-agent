import { complete } from "../llm/client";
import { executeTool, getToolSpecs } from "../tools/index";
import { addMessage } from "../session/history";
import type { CompletionMessage, CompletionResponse, ToolCallInfo } from "../llm/types";
import type { AgentDefinition } from "./types";
import type { ToolResult } from "../tools/schema";
import { loadConfig } from "../config";

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type AgentUpdate =
  | { kind: "text"; content: string }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; toolCall: ToolCall; result: ToolResult }
  | { kind: "done"; content: string; toolCalls: number; duration: number; agentName: string; modelName: string }
  | { kind: "error"; error: string };

export const MAX_AGENT_ITERATIONS = 25;

export const DEFAULT_MAX_TOKENS = 1024;

function wrapToolResult(toolName: string, result: ToolResult): string {
  const summary = result.success
    ? truncateResult(result.data)
    : `Error: ${result.error}`;
  return `IMPORTANT: Do not echo the raw tool output below. Use only what you need from it, then answer concisely in your own words.\n\nTool result from ${toolName}:\n${summary}`;
}

export function parseToolCalls(text: string): { toolCalls: ToolCall[]; cleanText: string } {
  const toolCalls: ToolCall[] = [];
  const regex = /<TOOL_CALL>([\s\S]*?)<\/TOOL_CALL>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const block = match[1].trim();
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/);
    const argsMatch = block.match(/<args>([\s\S]*?)<\/args>/);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      let args: Record<string, unknown> = {};
      if (argsMatch) {
        try {
          args = JSON.parse(argsMatch[1].trim());
        } catch {
          args = { input: argsMatch[1].trim() };
        }
      }
      toolCalls.push({ name, args });
    }
  }
  const cleanText = text.replace(regex, "").trim();
  return { toolCalls, cleanText };
}

function parseToolCallArguments(argumentsJson: string): Record<string, unknown> {
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

export async function runAgentLoop(
  query: string,
  agent: AgentDefinition,
  history: CompletionMessage[],
  onUpdate: (update: AgentUpdate) => void,
  executeToolFn?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>,
  modelName = "unknown",
  sessionId?: string,
): Promise<string> {
  const startTime = performance.now();
  let toolCalls = 0;
  const exec = executeToolFn ?? executeTool;

  if (sessionId) {
    addMessage(sessionId, "user", query);
  }

  const tools = getToolSpecs();
  const systemPrompt = `${agent.systemPrompt}

You are an autonomous agent in a CLI environment. Be direct and terse:
- Never greet the user, never narrate your plans, never write "I will..." or "Let me...". Act, don't describe.
- For each request, immediately call the appropriate tool(s) and wait for the results before continuing.
- Prefer read_file and write_file directly when you already know the path. Use glob_files only to discover paths, with a targeted pattern.
- Once you have everything you need, answer the user's request concisely with the actual result.`;

  const messages: CompletionMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: query },
  ];

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    let response: CompletionResponse;
    try {
      const cfg = loadConfig();
      const model = cfg.selectedModel ?? "deepseek-chat";
      response = await complete({
        model,
        messages,
        temperature: 0.7,
        maxTokens: DEFAULT_MAX_TOKENS,
        tools,
        toolChoice: "auto",
      });
    } catch (err) {
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

    if (calls.length === 0 && content.trim()) {
      onUpdate({ kind: "text", content });
    }

    if (calls.length === 0) {
      onUpdate({
        kind: "done",
        content,
        toolCalls,
        duration: Math.round(performance.now() - startTime),
        agentName: agent.name,
        modelName,
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
