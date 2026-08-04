import type { AgentDefinition, AgentPermissions } from "./types";
import { exploreAgent } from "./builtin";
import { runAgentLoop } from "./agent-loop";
import { getToolSpecs } from "../tools/index";
import { isToolDenied } from "./index";
import { loadLlmConfig } from "../llm/config";
import type { ToolResult } from "../tools/schema";
import type { ToolDefinition as LlmToolDefinition } from "../llm/types";

export type SubagentTask = {
  agent: AgentDefinition;
  query: string;
};

export type SubagentResult = {
  output: string;
  toolCalls: number;
  duration: number;
};

export type SubagentTaskOptions = {
  description: string;
  prompt: string;
  agent?: AgentDefinition;
  modelId?: string;
  signal?: AbortSignal;
  maxIterations?: number;
  onStream?: (text: string) => void;
};

export async function runSubagent(task: SubagentTask): Promise<SubagentResult> {
  const start = Date.now();
  let toolCalls = 0;
  const outputParts: string[] = [];

  const lines = task.query.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("/")) continue;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = parts.slice(1);

    let toolName = "";
    let args: Record<string, unknown> = {};

    if (cmd === "/read" && rest[0]) {
      toolName = "read_file";
      args = {
        path: rest[0],
        offset: rest[1] ? Number(rest[1]) : undefined,
        limit: rest[2] ? Number(rest[2]) : undefined,
      };
    } else if (cmd === "/glob" && rest[0]) {
      toolName = "glob_files";
      args = { pattern: rest[0], path: rest[1] || undefined };
    } else if (cmd === "/call" && rest[0]) {
      toolName = rest[0];
      try {
        args = rest.slice(1).length ? JSON.parse(rest.slice(1).join(" ")) : {};
      } catch {
        args = { input: rest.slice(1).join(" ") };
      }
    }

    if (!toolName || isToolDenied(toolName, task.agent)) {
      outputParts.push(`Skipped: ${trimmed} (not available to this subagent)`);
      continue;
    }

    const { executeTool } = await import("../tools/index");
    let result: ToolResult;
    try {
      result = await executeTool(toolName, args);
      toolCalls++;
    } catch (err) {
      result = {
        success: false,
        error: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    outputParts.push(
      result.success
        ? `[${toolName}] OK\n${String(result.data ?? "").slice(0, 2000)}`
        : `[${toolName}] FAILED: ${result.error}`,
    );
  }

  const duration = Date.now() - start;

  return {
    output: outputParts.join("\n\n"),
    toolCalls,
    duration,
  };
}

function defaultSubagentModel(): string {
  try {
    const cfg = loadLlmConfig();
    return cfg.routing?.defaultModel || cfg.routing?.simpleModel || "deepseek-chat";
  } catch {
    return "deepseek-chat";
  }
}

export function subagentToolSpecs(agent: AgentDefinition): LlmToolDefinition[] {
  return getToolSpecs().filter(
    (t) => t.name !== "task" && !isToolDenied(t.name, agent),
  );
}

export async function runTaskSubagent(options: SubagentTaskOptions): Promise<SubagentResult> {
  const start = Date.now();
  const agent = options.agent ?? exploreAgent;
  const modelId = options.modelId ?? defaultSubagentModel();
  let toolCalls = 0;
  let errored = false;

  const toolSpecs = subagentToolSpecs(agent);

  const output = await runAgentLoop(
    options.prompt,
    agent,
    [],
    (update) => {
      if (update.kind === "tool_call") toolCalls++;
      if (update.kind === "error") errored = true;
      if (update.kind === "stream" && options.onStream) options.onStream(update.content);
    },
    {
      modelId,
      stream: false,
      signal: options.signal,
      maxIterations: options.maxIterations ?? 15,
      tools: toolSpecs,
      executeToolFn: async (
        name: string,
        args: Record<string, unknown>,
        ctx?: { onOutput?: (chunk: string) => void; signal?: AbortSignal },
      ): Promise<ToolResult> => {
        if (name === "task") {
          return {
            success: false,
            error: `The "task" tool is disabled inside a subagent to prevent unbounded recursion.`,
          };
        }
        if (isToolDenied(name, agent)) {
          return {
            success: false,
            error: `Tool "${name}" is denied by the subagent "${agent.name}".`,
          };
        }
        const { executeTool } = await import("../tools/index");
        return executeTool(name, args, ctx);
      },
    },
  );

  return {
    output,
    toolCalls,
    duration: Date.now() - start,
    ...(errored ? { error: "Subagent reported an error mid-task" } : {}),
  };
}

export type ParallelSubagentOptions = {
  tasks: SubagentTaskOptions[];
  concurrency?: number;
  signal?: AbortSignal;
  onStream?: (taskIndex: number, text: string) => void;
};

export async function runParallelSubagents(options: ParallelSubagentOptions): Promise<SubagentResult[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const queue = options.tasks.map((task, index) => ({ task, index }));
  const results: SubagentResult[] = new Array(queue.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      if (options.signal?.aborted) return;
      const { task, index } = queue[cursor++];
      try {
        results[index] = await runTaskSubagent({
          ...task,
          signal: options.signal,
          onStream: (text) => options.onStream?.(index, text),
        });
      } catch (err) {
        results[index] = {
          output: `Subagent failed: ${err instanceof Error ? err.message : String(err)}`,
          toolCalls: 0,
          duration: 0,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()));

  return results;
}
