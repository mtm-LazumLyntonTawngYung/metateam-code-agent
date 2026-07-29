import { executeTool } from "./index";
import type { ToolResult } from "./schema";

const SENSITIVE_TOOLS = new Set(["edit_file", "run_bash"]);

export function isSensitiveTool(name: string): boolean {
  return SENSITIVE_TOOLS.has(name);
}

export type PermissionResponse = "accept" | "reject" | "always";

export type PendingPermission = {
  toolName: string;
  args: Record<string, unknown>;
  resolve: (result: ToolResult) => void;
};

export function buildPermissionRequest(
  name: string,
  args: Record<string, unknown>,
): PendingPermission | null {
  if (!SENSITIVE_TOOLS.has(name)) return null;
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
  }
  if (response === "reject") {
    return { success: false, error: "Permission rejected by user" };
  }
  return executeTool(pending.toolName, pending.args);
}
