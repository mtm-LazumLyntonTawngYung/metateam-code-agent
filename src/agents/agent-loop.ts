import { complete } from "../llm/client";
import { executeTool, getAllTools } from "../tools/index";
import type { CompletionMessage, CompletionResponse } from "../llm/types";
import type { AgentDefinition } from "./types";
import type { ToolResult } from "../tools/schema";

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type AgentUpdate =
  | { kind: "text"; content: string }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; toolCall: ToolCall; result: ToolResult }
  | { kind: "done"; content: string; toolCalls: number; duration: number }
  | { kind: "error"; error: string };

export const MAX_AGENT_ITERATIONS = 25;

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

function buildToolDescriptions(): string {
  return getAllTools()
    .map((t) => {
      const props = t.parameters.properties;
      const required = t.parameters.required ?? [];
      const paramStr = Object.entries(props)
        .map(
          ([k, v]) =>
            `    ${k}${required.includes(k) ? " (required)" : ""}: ${v.type}${v.description ? ` - ${v.description}` : ""}`,
        )
        .join("\n");
      return `  - ${t.name}: ${t.description}\n${paramStr}`;
    })
    .join("\n");
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
): Promise<string> {
  const startTime = performance.now();
  let toolCalls = 0;
  const exec = executeToolFn ?? executeTool;

  const toolDescriptions = buildToolDescriptions();
  const systemPrompt = `${agent.systemPrompt}

You are running in a CLI environment. You have access to the following tools. When you need to use one, emit a TOOL_CALL block in your response:

${toolDescriptions}

To call a tool, output this exact format (no markdown fences, raw XML):
<TOOL_CALL>
<name>tool_name</name>
<args>{"arg1": "value1"}</args>
</TOOL_CALL>

You may call multiple tools in a single response. Always wait for the tool result before proceeding.
When you have completed the task, respond with a summary and no TOOL_CALL blocks.`;

  const messages: CompletionMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: query },
  ];

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    let response: CompletionResponse;
    try {
      response = await complete({
        model: "deepseek-chat",
        messages,
        temperature: 0.7,
        maxTokens: 4096,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onUpdate({ kind: "error", error: msg });
      return `LLM call failed: ${msg}`;
    }

    const content = response.content;
    const { toolCalls: calls, cleanText } = parseToolCalls(content);

    messages.push({ role: "assistant", content });

    if (cleanText) {
      onUpdate({ kind: "text", content: cleanText });
    }

    if (calls.length === 0) {
      onUpdate({
        kind: "done",
        content: cleanText || content,
        toolCalls,
        duration: Math.round(performance.now() - startTime),
      });
      return cleanText || content;
    }

    for (const tc of calls) {
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

      const resultContent = result.success
        ? `[Tool ${tc.name} result]\n${JSON.stringify(result.data ?? "(completed)")}`
        : `[Tool ${tc.name} error]\n${result.error}`;

      messages.push({ role: "user", content: resultContent });
    }
  }

  const msg = `Agent reached maximum of ${MAX_AGENT_ITERATIONS} iterations.`;
  onUpdate({ kind: "error", error: msg });
  return msg;
}
