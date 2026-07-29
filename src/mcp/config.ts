import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

export type McpServerConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

function loadFromFile(path: string): McpConfig | null {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8")) as McpConfig;
    }
  } catch {
    // corrupt or missing
  }
  return null;
}

export function loadMcpConfig(): McpConfig {
  const local = loadFromFile(join(process.cwd(), ".mtc", "mcp.json"));
  if (local) return local;
  const global_ = loadFromFile(join(homedir(), ".config", "mtc", "mcp.json"));
  if (global_) return global_;
  return { mcpServers: {} };
}
