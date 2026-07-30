import { loadMcpConfig } from "./config";
import { McpClient } from "./client";
import { registerTool } from "../tools/index";

export type ServerState = {
  name: string;
  status: "connected" | "errored";
  toolCount: number;
  error?: string;
};

const clients = new Map<string, McpClient>();
const cleanupFns = new Map<string, () => void>();
const serverErrors = new Map<string, string>();

export function getConnectedCount(): number {
  let count = 0;
  for (const c of clients.values()) {
    if (c.connected) count++;
  }
  return count;
}

export function getConnectedServers(): string[] {
  const servers: string[] = [];
  for (const [name, c] of clients) {
    if (c.connected) servers.push(name);
  }
  return servers;
}

export function getServerStates(): ServerState[] {
  const states: ServerState[] = [];
  for (const [name, c] of clients) {
    states.push({
      name,
      status: "connected",
      toolCount: getToolCount(name),
    });
  }
  for (const [name, error] of serverErrors) {
    if (!clients.has(name)) {
      states.push({ name, status: "errored", toolCount: 0, error });
    }
  }
  return states;
}

let toolCounts = new Map<string, number>();

function getToolCount(name: string): number {
  return toolCounts.get(name) ?? 0;
}

export async function startAll(): Promise<void> {
  const config = loadMcpConfig();
  const entries = Object.entries(config.mcpServers);

  for (const [, cleanup] of cleanupFns) cleanup();
  cleanupFns.clear();
  for (const [, c] of clients) c.close();
  clients.clear();
  serverErrors.clear();
  toolCounts.clear();

  const results = await Promise.allSettled(
    entries.map(async ([serverName, serverConfig]) => {
      const client = new McpClient(serverName, serverConfig);
      await client.initialize();
      const tools = await client.listTools();
      toolCounts.set(serverName, tools.length);
      for (const tool of tools) {
        const key = `${serverName}/${tool.name}`;
        const cleanup = registerTool(tool.name, {
          ...tool,
          execute: async (args) => client.callTool(tool.name, args),
        });
        cleanupFns.set(key, cleanup);
      }
      clients.set(serverName, client);
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      const [serverName] = entries[i];
      const err = result.reason;
      const msg = err instanceof Error ? err.message : String(err);
      serverErrors.set(serverName, msg);
      console.error(`MCP init error (${serverName}): ${msg}`);
    }
  }
}

export function recordServerError(name: string, error: string): void {
  serverErrors.set(name, error);
}

export async function stopAll(): Promise<void> {
  for (const [, cleanup] of cleanupFns) cleanup();
  cleanupFns.clear();
  for (const [, c] of clients) c.close();
  clients.clear();
}
