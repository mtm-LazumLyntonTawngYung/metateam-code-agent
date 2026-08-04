import { loadMcpConfig } from "./config";
import { McpClient } from "./client";
import { registerTool } from "../tools/index";
import type { JsonSchema, ToolDefinition } from "../tools/schema";

export type ServerState = {
  name: string;
  status: "connected" | "errored" | "disabled";
  toolCount: number;
  error?: string;
};

const clients = new Map<string, McpClient>();
const cleanupFns = new Map<string, Array<() => void>>();
const serverErrors = new Map<string, string>();
const serverStates = new Map<string, "enabled" | "disabled">();

export function getConnectedCount(): number {
  let count = 0;
  for (const [name, c] of clients) {
    if (c.connected && serverStates.get(name) !== "disabled") count++;
  }
  return count;
}

export function getConnectedServers(): string[] {
  const servers: string[] = [];
  for (const [name, c] of clients) {
    if (c.connected && serverStates.get(name) !== "disabled") servers.push(name);
  }
  return servers;
}

export function getServerStates(): ServerState[] {
  const states: ServerState[] = [];
  for (const [name, c] of clients) {
    const state = serverStates.get(name) ?? "enabled";
    if (state === "disabled") {
      states.push({ name, status: "disabled", toolCount: 0 });
    } else if (c.connected) {
      states.push({ name, status: "connected", toolCount: getToolCount(name) });
    }
  }
  for (const [name, error] of serverErrors) {
    if (!clients.has(name)) {
      states.push({ name, status: "errored", toolCount: 0, error });
    }
  }
  return states;
}

export function getServerState(name: string): "enabled" | "disabled" {
  return serverStates.get(name) ?? "enabled";
}

export function toggleServer(name: string): boolean {
  const current = serverStates.get(name) ?? "enabled";
  const next = current === "enabled" ? "disabled" : "enabled";
  serverStates.set(name, next);
  return next === "enabled";
}

export async function toggleServerAndRefresh(name: string): Promise<boolean> {
  const enabled = toggleServer(name);
  if (enabled) {
    await startAll();
  } else {
    await stopServer(name);
  }
  return enabled;
}

export async function stopServer(name: string): Promise<void> {
  const cleanups = cleanupFns.get(name);
  if (cleanups) {
    for (const cleanup of cleanups) cleanup();
  }
  cleanupFns.delete(name);
  const client = clients.get(name);
  if (client) client.close();
  clients.delete(name);
}

let toolCounts = new Map<string, number>();

function getToolCount(name: string): number {
  return toolCounts.get(name) ?? 0;
}

function normalizeMcpSchema(schema: unknown): JsonSchema {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const obj = schema as Record<string, unknown>;
  if (obj.type !== "object") {
    return { type: "object", properties: {} };
  }
  const properties = (obj.properties as Record<string, unknown> | undefined) ?? {};
  const normalized: Record<string, { type: string; description?: string }> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!value || typeof value !== "object") continue;
    const prop = value as Record<string, unknown>;
    const propType = String(prop.type ?? "string");
    normalized[key] = {
      type: propType,
      description: typeof prop.description === "string" ? prop.description : undefined,
    };
  }
  return {
    type: "object",
    properties: normalized as Record<string, { type: "string" | "number" | "boolean" | "array" | "object"; description?: string; default?: unknown; items?: { type: "string" | "number" } }>,
    required: Array.isArray(obj.required) ? obj.required.filter((r): r is string => typeof r === "string") : undefined,
  };
}

export async function startAll(): Promise<void> {
  const config = loadMcpConfig();
  const entries = Object.entries(config.mcpServers);

  for (const [, cleanups] of cleanupFns) {
    for (const cleanup of cleanups) cleanup();
  }
  cleanupFns.clear();
  for (const [, c] of clients) c.close();
  clients.clear();
  serverErrors.clear();
  toolCounts.clear();

  const enabled = entries.filter(([serverName]) => serverStates.get(serverName) !== "disabled");
  const results = await Promise.allSettled(
    enabled.map(async ([serverName, serverConfig]) => {
      const client = new McpClient(serverName, serverConfig);
      await client.initialize();
      const tools = await client.listTools();
      toolCounts.set(serverName, tools.length);
      const cleanups: Array<() => void> = [];
      for (const tool of tools) {
        const fullName = `${serverName}/${tool.name}`;
        const normalizedParameters = normalizeMcpSchema(tool.parameters);
        cleanups.push(registerTool(fullName, {
          name: fullName,
          description: tool.description ?? `MCP tool from ${serverName}`,
          parameters: normalizedParameters,
          execute: async (args: Record<string, unknown>) => {
            try {
              return await client.callTool(tool.name, args);
            } catch (err) {
              return {
                success: false,
                error: `MCP tool '${fullName}' failed: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          },
        }));
      }
      cleanupFns.set(serverName, cleanups);
      clients.set(serverName, client);
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      const [serverName] = enabled[i];
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
  for (const [, cleanups] of cleanupFns) {
    for (const cleanup of cleanups) cleanup();
  }
  cleanupFns.clear();
  for (const [, c] of clients) c.close();
  clients.clear();
}
