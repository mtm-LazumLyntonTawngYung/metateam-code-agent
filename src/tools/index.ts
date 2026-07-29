import readFileTool from "./read_file";
import writeFileTool from "./write_file";
import editFileTool from "./edit_file";
import runBashTool from "./run_bash";
import globFilesTool from "./glob_files";
import type { ToolDefinition, ToolResult } from "./schema";
import { trackToolCall } from "../telemetry/tracker";

const toolRegistry: Record<string, ToolDefinition> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  run_bash: runBashTool,
  glob_files: globFilesTool,
};

export type { ToolDefinition, ToolResult, JsonSchema } from "./schema";

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry[name];
}

export function getAllTools(): ToolDefinition[] {
  return Object.values(toolRegistry);
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
    return { success: false, error: `Unknown tool: ${name}` };
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
    return {
      success: false,
      error: `Tool '${name}' threw: ${errorMsg}`,
    };
  }
}

export {
  readFileTool,
  writeFileTool,
  editFileTool,
  runBashTool,
  globFilesTool,
};
