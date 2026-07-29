import type { AgentDefinition } from "./types";
import { isToolDenied } from "./index";
import { executeTool } from "../tools/index";
import type { ToolResult } from "../tools/schema";

export type SubagentTask = {
  agent: AgentDefinition;
  query: string;
};

export type SubagentResult = {
  output: string;
  toolCalls: number;
  duration: number;
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
