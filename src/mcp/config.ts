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

type OpenCodeMcpEntry = {
  command: string[];
  enabled?: boolean;
  type?: string;
  env?: Record<string, string>;
};

type OpenCodeConfig = {
  mcp?: Record<string, OpenCodeMcpEntry>;
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

function loadOpenCodeConfig(): McpConfig | null {
  const paths = [
    join(homedir(), ".config", "opencode", "opencode.json"),
    join(homedir(), ".opencode", "config.json"),
    join(process.cwd(), ".opencode.json"),
  ];
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, "utf-8")) as OpenCodeConfig;
        if (raw.mcp && typeof raw.mcp === "object") {
          const servers: Record<string, McpServerConfig> = {};
          for (const [name, entry] of Object.entries(raw.mcp)) {
            if (entry.enabled === false) continue;
            if (!entry.command || entry.command.length === 0) continue;
            servers[name] = {
              command: entry.command[0],
              args: entry.command.slice(1),
              env: entry.env,
            };
          }
          if (Object.keys(servers).length > 0) {
            return { mcpServers: servers };
          }
        }
      }
    } catch {
      // corrupt or missing — skip
    }
  }
  return null;
}

export function loadMcpConfig(): McpConfig {
  const local = loadFromFile(join(process.cwd(), ".mtc", "mcp.json"));
  if (local) return local;
  const global_ = loadFromFile(join(homedir(), ".config", "mtc", "mcp.json"));
  if (global_) return global_;
  const opencode = loadOpenCodeConfig();
  if (opencode) return opencode;
  return { mcpServers: {} };
}
