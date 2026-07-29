import { loadMcpConfig } from "./config";
import { McpClient } from "./client";
import { registerTool } from "../tools/index";

const clients = new Map<string, McpClient>();
const cleanupFns = new Map<string, () => void>();

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

export async function startAll(): Promise<void> {
  const config = loadMcpConfig();
  const entries = Object.entries(config.mcpServers);

  for (const [, cleanup] of cleanupFns) cleanup();
  cleanupFns.clear();
  for (const [, c] of clients) c.close();
  clients.clear();

  const results = await Promise.allSettled(
    entries.map(async ([serverName, serverConfig]) => {
      const client = new McpClient(serverName, serverConfig);
      await client.initialize();
      const tools = await client.listTools();
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

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`MCP init error: ${result.reason}`);
    }
  }
}

export async function stopAll(): Promise<void> {
  for (const [, cleanup] of cleanupFns) cleanup();
  cleanupFns.clear();
  for (const [, c] of clients) c.close();
  clients.clear();
}
