import { executeTool, getAllTools } from "../tools/index";
import { isSensitiveTool } from "../tools/permissions";
import {
  createSession,
  addMessage,
  getMessages,
  deleteSession,
} from "../session/history";
import {
  setSessionId,
  trackToolCall,
  trackSessionStart,
  trackSessionEnd,
} from "../telemetry/tracker";

export type ServerConfig = {
  port: number;
  host?: string;
};

export type WsClient = {
  send: (data: string) => void;
  close: () => void;
};

type PendingPerm = {
  toolName: string;
  args: Record<string, unknown>;
  resolve: (result: { success: boolean; data?: unknown; error?: string }) => void;
};

const clients = new Map<string, { sessionId: string; alwaysAllow: Set<string>; pendingPerm: PendingPerm | null }>();

export function createServerSession(clientId: string): string {
  const sid = createSession("ws-session");
  clients.set(clientId, { sessionId: sid, alwaysAllow: new Set(), pendingPerm: null });
  setSessionId(sid);
  trackSessionStart();
  return sid;
}

export function destroyServerSession(clientId: string): void {
  const client = clients.get(clientId);
  if (client) {
    setSessionId(client.sessionId);
    trackSessionEnd();
    clients.delete(clientId);
  }
}

export function getSessionId(clientId: string): string | null {
  return clients.get(clientId)?.sessionId ?? null;
}

const TOOL_COMMANDS: Record<string, string> = {
  "/read": "read_file",
  "/write": "write_file",
  "/edit": "edit_file",
  "/bash": "run_bash",
  "/glob": "glob_files",
};

export async function handleQuery(
  clientId: string,
  queryId: string,
  text: string,
  send: (msg: string) => void,
): Promise<void> {
  const client = clients.get(clientId);
  if (!client) {
    send(jsonMsg("error", queryId, { message: "No session. Reconnect." }));
    return;
  }

  setSessionId(client.sessionId);
  addMessage(client.sessionId, "user", text);

  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1);

  const toolName = TOOL_COMMANDS[cmd];

  if (toolName) {
    const args = buildArgs(cmd, rest);
    if (!args) {
      send(jsonMsg("result", queryId, { success: false, error: `Usage: ${cmd} <args>` }));
      return;
    }
    await executeToolWithPermissions(clientId, queryId, toolName, args, send);
  } else if (cmd === "/list-tools") {
    const tools = getAllTools().map((t) => ({ name: t.name, description: t.description }));
    send(jsonMsg("result", queryId, { success: true, data: tools }));
  } else if (cmd === "/session") {
    send(jsonMsg("result", queryId, { success: true, data: { sessionId: client.sessionId } }));
  } else if (cmd === "/history") {
    const msgs = getMessages(client.sessionId, true);
    send(jsonMsg("result", queryId, { success: true, data: msgs }));
  } else {
    send(jsonMsg("result", queryId, { success: false, error: `Unknown command: ${cmd}. Try /read, /write, /edit, /bash, /glob, /list-tools, /session, /history` }));
  }
}

function buildArgs(cmd: string, rest: string[]): Record<string, unknown> | null {
  switch (cmd) {
    case "/read":
      if (!rest[0]) return null;
      return {
        path: rest[0],
        offset: rest[1] ? Number(rest[1]) : undefined,
        limit: rest[2] ? Number(rest[2]) : undefined,
      };
    case "/write":
      if (!rest[0] || rest.slice(1).length === 0) return null;
      return { path: rest[0], content: rest.slice(1).join(" ") };
    case "/edit":
      if (!rest[0] || !rest[1]) return null;
      return { path: rest[0], targetString: rest[1], replacement: rest.slice(2).join(" ") };
    case "/bash":
      if (rest.length === 0) return null;
      return { command: rest.join(" ") };
    case "/glob":
      if (!rest[0]) return null;
      return { pattern: rest[0], path: rest[1] || undefined };
    default:
      return null;
  }
}

async function executeToolWithPermissions(
  clientId: string,
  queryId: string,
  toolName: string,
  args: Record<string, unknown>,
  send: (msg: string) => void,
): Promise<void> {
  const client = clients.get(clientId);
  if (!client) return;

  if (isSensitiveTool(toolName) && !client.alwaysAllow.has(toolName)) {
    const result = await new Promise<{ success: boolean; data?: unknown; error?: string }>((resolve) => {
      client.pendingPerm = { toolName, args, resolve };
      send(jsonMsg("permission_request", queryId, { toolName, args, description: `Allow tool: ${toolName}?` }));
    });
    if (!result.success) {
      send(jsonMsg("result", queryId, result));
      return;
    }
  }

  const toolResult = await executeTool(toolName, args);

  if (toolResult.success && toolName === "edit_file" && args.path) {
    send(jsonMsg("diff", queryId, {
      filePath: args.path,
      success: true,
      data: toolResult.data,
    }));
  }

  send(jsonMsg("result", queryId, toolResult));
}

export function handlePermissionResponse(
  clientId: string,
  requestId: string,
  response: string,
  send: (msg: string) => void,
): void {
  const client = clients.get(clientId);
  if (!client || !client.pendingPerm) {
    send(jsonMsg("error", requestId, { message: "No pending permission request" }));
    return;
  }

  if (response === "always") {
    client.alwaysAllow.add(client.pendingPerm.toolName);
  }

  if (response === "reject" || response === "always-reject") {
    client.pendingPerm.resolve({ success: false, error: "Permission rejected by user" });
  } else {
    client.pendingPerm.resolve({ success: true });
  }
  client.pendingPerm = null;
}

export function handleToolCall(
  clientId: string,
  queryId: string,
  toolName: string,
  args: Record<string, unknown>,
  send: (msg: string) => void,
): void {
  executeToolWithPermissions(clientId, queryId, toolName, args, send);
}

function jsonMsg(type: string, id: string, data: Record<string, unknown>): string {
  return JSON.stringify({ type, id, ...data });
}
