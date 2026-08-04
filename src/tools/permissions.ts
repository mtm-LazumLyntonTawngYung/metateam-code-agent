import type { ToolResult } from "./schema";
import type { AgentPermissions } from "../agents/types";
import { loadConfig, saveConfig } from "../config";

export type PermissionAction = "allow" | "ask" | "deny";
export type PermissionResponse = "accept" | "reject" | "always";

export type PermissionRule = {
  tool: string;
  action: PermissionAction;
};

export type PendingPermission = {
  toolName: string;
  args: Record<string, unknown>;
  resolve: (result: ToolResult) => void;
};

export const SENSITIVE_TOOLS = new Set(["edit_file", "run_bash"]);

const DEFAULT_ASK_TOOLS = new Set(["edit_file", "write_file", "run_bash"]);

const CATEGORY_MAP: Record<string, string[]> = {
  edit: ["edit_file", "write_file"],
  bash: ["run_bash", "websearch"],
  read: ["read_file", "glob_files"],
};

export function isSensitiveTool(name: string): boolean {
  return SENSITIVE_TOOLS.has(name);
}

export function matchToolPattern(pattern: string, toolName: string): boolean {
  if (pattern === toolName) return true;
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return toolName.startsWith(prefix) || toolName === prefix.slice(0, -1);
  }
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  return re.test(toolName);
}

export function agentCategoryDenied(toolName: string, permissions?: AgentPermissions): boolean {
  if (!permissions) return false;
  for (const [category, tools] of Object.entries(CATEGORY_MAP)) {
    if (tools.includes(toolName)) {
      return permissions[category as keyof AgentPermissions] === "deny";
    }
  }
  return permissions.execute === "deny";
}

export type PermissionResolveOptions = {
  toolName: string;
  permissions?: AgentPermissions;
  rules?: PermissionRule[];
  alwaysAllowed?: Iterable<string>;
};

export function resolvePermissionAction(opts: PermissionResolveOptions): PermissionAction {
  const { toolName, permissions, rules = [], alwaysAllowed } = opts;

  if (agentCategoryDenied(toolName, permissions)) return "deny";

  if (alwaysAllowed && containsTool(alwaysAllowed, toolName)) return "allow";

  for (const rule of rules) {
    if (matchToolPattern(rule.tool, toolName)) return rule.action;
  }

  if (DEFAULT_ASK_TOOLS.has(toolName)) return "ask";

  return "allow";
}

function containsTool(patterns: Iterable<string>, toolName: string): boolean {
  for (const p of patterns) {
    if (matchToolPattern(p, toolName)) return true;
  }
  return false;
}

const CONFIG_KEY = "permissions";

type PersistedPermissions = {
  rules?: PermissionRule[];
  alwaysAllow?: string[];
};

function readPersisted(): PersistedPermissions {
  const cfg = loadConfig();
  const raw = (cfg as unknown as Record<string, unknown>)[CONFIG_KEY] as PersistedPermissions | undefined;
  return raw ?? {};
}

function isValidRule(rule: PermissionRule): boolean {
  return (
    typeof rule === "object" &&
    rule !== null &&
    typeof rule.tool === "string" &&
    (rule.action === "allow" || rule.action === "ask" || rule.action === "deny")
  );
}

export function loadPermissionRules(): PermissionRule[] {
  const { rules, alwaysAllow } = readPersisted();
  const explicit = Array.isArray(rules) ? rules.filter(isValidRule) : [];
  const always = Array.isArray(alwaysAllow)
    ? alwaysAllow.filter((t) => typeof t === "string").map((t) => ({ tool: t, action: "allow" as const }))
    : [];
  return [...explicit, ...always];
}

export function savePermissionRules(rules: PermissionRule[]): void {
  const current = readPersisted();
  const next: PersistedPermissions = {
    ...current,
    rules: rules.filter(isValidRule),
  };
  saveConfig({ [CONFIG_KEY]: next } as unknown as Record<string, unknown>);
}

export function saveAlwaysAllow(toolName: string): void {
  const current = readPersisted();
  const always = new Set(current.alwaysAllow ?? []);
  always.add(toolName);
  const next: PersistedPermissions = {
    ...current,
    alwaysAllow: [...always],
  };
  saveConfig({ [CONFIG_KEY]: next } as unknown as Record<string, unknown>);
}

export function clearAlwaysAllow(toolName: string): void {
  const current = readPersisted();
  const always = new Set(current.alwaysAllow ?? []);
  always.delete(toolName);
  const next: PersistedPermissions = {
    ...current,
    alwaysAllow: [...always],
  };
  saveConfig({ [CONFIG_KEY]: next } as unknown as Record<string, unknown>);
}

export function buildPermissionRequest(
  name: string,
  args: Record<string, unknown>,
): PendingPermission | null {
  if (!isSensitiveTool(name)) return null;
  let resolve: (result: ToolResult) => void;
  const promise = new Promise<ToolResult>((r) => {
    resolve = r;
  });
  return { toolName: name, args, resolve: resolve! };
}

export async function resolvePermission(
  pending: PendingPermission,
  response: PermissionResponse,
  alwaysAllow: Set<string>,
): Promise<ToolResult> {
  if (response === "always") {
    alwaysAllow.add(pending.toolName);
    saveAlwaysAllow(pending.toolName);
  }
  if (response === "reject") {
    return { success: false, error: "Permission rejected by user" };
  }
  return executeToolInternal(pending.toolName, pending.args);
}

async function executeToolInternal(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { executeTool } = await import("./index");
  return executeTool(name, args);
}
