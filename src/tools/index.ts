import readFileTool from "./read_file";
import writeFileTool from "./write_file";
import editFileTool from "./edit_file";
import runBashTool from "./run_bash";
import globFilesTool from "./glob_files";
import websearchTool from "./websearch";
import grepFilesTool from "./grep_files";
import type { ToolDefinition, ToolResult } from "./schema";
import type { ToolDefinition as LlmToolDefinition } from "../llm/types";
import { trackToolCall } from "../telemetry/tracker";
import { ToolError } from "../utils/errors";

const toolRegistry: Record<string, ToolDefinition> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  run_bash: runBashTool,
  glob_files: globFilesTool,
  websearch: websearchTool,
  grep_files: grepFilesTool,
};

export type { ToolDefinition, ToolResult, JsonSchema } from "./schema";

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry[name];
}

export function getAllTools(): ToolDefinition[] {
  return Object.values(toolRegistry);
}

export function getToolSpecs(): LlmToolDefinition[] {
  return Object.values(toolRegistry).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

export function registerTool(name: string, def: ToolDefinition): () => void {
  if (toolRegistry[name]) {
    console.warn(`Warning: overwriting existing tool "${name}"`);
  }
  toolRegistry[name] = def;
  return () => {
    delete toolRegistry[name];
  };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = toolRegistry[name];
  if (!tool) {
    return ToolError.unknown(name).toResult();
  }

  if (tool.schema) {
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return ToolError.invalidArgs(name, detail).toResult();
    }
    args = parsed.data as Record<string, unknown>;
  }

  const start = performance.now();
  try {
    const result = await tool.execute(args);
    const duration = Math.round(performance.now() - start);
    trackToolCall(name, result.success, duration, result.error);
    return result;
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    const errorMsg = err instanceof Error ? err.message : String(err);
    trackToolCall(name, false, duration, errorMsg);
    return ToolError.execution(name, errorMsg).toResult();
  }
}

export {
  readFileTool,
  writeFileTool,
  editFileTool,
  runBashTool,
  globFilesTool,
  websearchTool,
  grepFilesTool,
};
