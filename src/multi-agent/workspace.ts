import { createHash } from "crypto";
import type {
  WorkspaceEntry,
  WorkspaceOperation,
  WorkspaceResult,
  ConflictInfo,
  ConflictResolution,
  WorkspaceConfig,
} from "./types";

const defaultWorkspaceConfig: WorkspaceConfig = {
  maxVersions: 10,
  conflictDetectionEnabled: true,
  autoMergeEnabled: true,
  accessControlEnabled: true,
  snapshotInterval: 100,
};

const workspace = new Map<string, WorkspaceEntry>();
const versionHistory = new Map<string, WorkspaceEntry[]>();
const accessControl = new Map<string, Set<string>>();
const operationLog: WorkspaceOperation[] = [];
let workspaceConfig = defaultWorkspaceConfig;

export function readEntry(key: string, agentId: string): WorkspaceResult {
  const entry = workspace.get(key);
  if (!entry) {
    return { success: false, error: `Key "${key}" not found` };
  }

  if (workspaceConfig.accessControlEnabled) {
    const allowedAgents = accessControl.get(key);
    if (allowedAgents && !allowedAgents.has(agentId)) {
      return { success: false, error: `Agent "${agentId}" not authorized to read "${key}"` };
    }
  }

  logOperation({
    type: "read",
    key,
    agentId,
    timestamp: new Date().toISOString(),
  });

  return { success: true, entry: { ...entry } };
}

export function writeEntry(
  key: string,
  value: unknown,
  agentId: string,
  expectedVersion?: number,
): WorkspaceResult {
  const existingEntry = workspace.get(key);

  if (existingEntry && expectedVersion !== undefined) {
    if (existingEntry.version !== expectedVersion) {
      return {
        success: false,
        conflict: {
          key,
          currentVersion: existingEntry.version,
          expectedVersion,
          lastModifiedBy: existingEntry.lastModifiedBy,
          lastModifiedAt: existingEntry.lastModifiedAt,
        },
      };
    }
  }

  if (workspaceConfig.accessControlEnabled) {
    const allowedAgents = accessControl.get(key);
    if (allowedAgents && !allowedAgents.has(agentId)) {
      return { success: false, error: `Agent "${agentId}" not authorized to write "${key}"` };
    }
  }

  const newVersion = existingEntry ? existingEntry.version + 1 : 1;
  const checksum = calculateChecksum(value);

  const newEntry: WorkspaceEntry = {
    key,
    value,
    version: newVersion,
    lastModifiedBy: agentId,
    lastModifiedAt: new Date().toISOString(),
    checksum,
    metadata: {},
  };

  workspace.set(key, newEntry);

  if (!versionHistory.has(key)) {
    versionHistory.set(key, []);
  }
  const history = versionHistory.get(key)!;
  history.push({ ...newEntry });
  if (history.length > workspaceConfig.maxVersions) {
    history.shift();
  }

  logOperation({
    type: "write",
    key,
    value,
    expectedVersion,
    agentId,
    timestamp: new Date().toISOString(),
  });

  return { success: true, entry: { ...newEntry } };
}

export function deleteEntry(key: string, agentId: string): WorkspaceResult {
  const existingEntry = workspace.get(key);
  if (!existingEntry) {
    return { success: false, error: `Key "${key}" not found` };
  }

  if (workspaceConfig.accessControlEnabled) {
    const allowedAgents = accessControl.get(key);
    if (allowedAgents && !allowedAgents.has(agentId)) {
      return { success: false, error: `Agent "${agentId}" not authorized to delete "${key}"` };
    }
  }

  workspace.delete(key);
  versionHistory.delete(key);
  accessControl.delete(key);

  logOperation({
    type: "delete",
    key,
    agentId,
    timestamp: new Date().toISOString(),
  });

  return { success: true, entry: existingEntry };
}

export function getVersionHistory(key: string): WorkspaceEntry[] {
  return versionHistory.get(key) ?? [];
}

export function getLatestVersion(key: string): number {
  const entry = workspace.get(key);
  return entry?.version ?? 0;
}

export function setAccessControl(key: string, allowedAgents: string[]): void {
  accessControl.set(key, new Set(allowedAgents));
}

export function isAuthorized(key: string, agentId: string, operation: "read" | "write" | "delete"): boolean {
  if (!workspaceConfig.accessControlEnabled) return true;

  const allowedAgents = accessControl.get(key);
  if (!allowedAgents) return true;

  return allowedAgents.has(agentId);
}

export function calculateChecksum(value: unknown): string {
  const str = JSON.stringify(value);
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

export function verifyChecksum(key: string): boolean {
  const entry = workspace.get(key);
  if (!entry) return false;

  const currentChecksum = calculateChecksum(entry.value);
  return entry.checksum === currentChecksum;
}

export function getWorkspaceKeys(): string[] {
  return Array.from(workspace.keys());
}

export function getWorkspaceSize(): number {
  return workspace.size;
}

export function getWorkspaceSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, entry] of workspace) {
    snapshot[key] = entry.value;
  }
  return snapshot;
}

export function loadSnapshot(data: Record<string, unknown>, agentId: string): void {
  for (const [key, value] of Object.entries(data)) {
    writeEntry(key, value, agentId);
  }
}

function logOperation(operation: WorkspaceOperation): void {
  operationLog.push(operation);
  if (operationLog.length > 1000) {
    operationLog.shift();
  }
}

export function getOperationLog(limit?: number): WorkspaceOperation[] {
  if (limit) {
    return operationLog.slice(-limit);
  }
  return [...operationLog];
}

export function clearWorkspace(): void {
  workspace.clear();
  versionHistory.clear();
  accessControl.clear();
  operationLog.length = 0;
}

export function getWorkspaceConfig(): WorkspaceConfig {
  return { ...workspaceConfig };
}

export function updateWorkspaceConfig(config: Partial<WorkspaceConfig>): void {
  workspaceConfig = { ...workspaceConfig, ...config };
}
