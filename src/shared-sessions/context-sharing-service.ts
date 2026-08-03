import { randomUUID } from "crypto";
import { run, all, get } from "./db";
import type {
  ContextSnapshot,
  FileTreeNode,
  Breakpoint,
  VariableWatch,
} from "./types";
import { broadcastSessionEvent } from "./event-bus";

export function captureContext(
  sessionId: string,
  fileTree: FileTreeNode[],
  environment: Record<string, string>,
  commandHistory: string[],
  breakpoints: Breakpoint[],
  variableWatches: VariableWatch[],
): ContextSnapshot {
  const id = randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT INTO context_snapshots (id, session_id, file_tree, environment, command_history, breakpoints, variable_watches)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sessionId,
      JSON.stringify(fileTree),
      JSON.stringify(environment),
      JSON.stringify(commandHistory),
      JSON.stringify(breakpoints),
      JSON.stringify(variableWatches),
    ],
  );

  const snapshot = getContextSnapshot(id)!;

  broadcastSessionEvent({
    type: "snapshot",
    sessionId,
    timestamp: now,
    data: { snapshotId: id },
  });

  return snapshot;
}

export function getContextSnapshot(id: string): ContextSnapshot | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM context_snapshots WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToContextSnapshot(row);
}

export function getSessionContextSnapshots(sessionId: string): ContextSnapshot[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM context_snapshots WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId],
  ).map(mapRowToContextSnapshot);
}

export function getLatestContextSnapshot(sessionId: string): ContextSnapshot | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM context_snapshots WHERE session_id = ? ORDER BY rowid DESC LIMIT 1",
    [sessionId],
  );
  if (!row) return null;
  return mapRowToContextSnapshot(row);
}

export function updateFileTree(
  sessionId: string,
  fileTree: FileTreeNode[],
): ContextSnapshot {
  const existing = getLatestContextSnapshot(sessionId);
  const environment = existing?.environment ?? {};
  const commandHistory = existing?.commandHistory ?? [];
  const breakpoints = existing?.breakpoints ?? [];
  const variableWatches = existing?.variableWatches ?? [];

  return captureContext(sessionId, fileTree, environment, commandHistory, breakpoints, variableWatches);
}

export function updateEnvironment(
  sessionId: string,
  environment: Record<string, string>,
): ContextSnapshot {
  const existing = getLatestContextSnapshot(sessionId);
  const fileTree = existing?.fileTree ?? [];
  const commandHistory = existing?.commandHistory ?? [];
  const breakpoints = existing?.breakpoints ?? [];
  const variableWatches = existing?.variableWatches ?? [];

  return captureContext(sessionId, fileTree, environment, commandHistory, breakpoints, variableWatches);
}

export function addCommandToHistory(
  sessionId: string,
  command: string,
): ContextSnapshot {
  const existing = getLatestContextSnapshot(sessionId);
  const fileTree = existing?.fileTree ?? [];
  const environment = existing?.environment ?? {};
  const commandHistory = [...(existing?.commandHistory ?? []), command];
  const breakpoints = existing?.breakpoints ?? [];
  const variableWatches = existing?.variableWatches ?? [];

  return captureContext(sessionId, fileTree, environment, commandHistory, breakpoints, variableWatches);
}

export function addBreakpoint(
  sessionId: string,
  breakpoint: Omit<Breakpoint, "id">,
): ContextSnapshot {
  const existing = getLatestContextSnapshot(sessionId);
  const fileTree = existing?.fileTree ?? [];
  const environment = existing?.environment ?? {};
  const commandHistory = existing?.commandHistory ?? [];
  const variableWatches = existing?.variableWatches ?? [];

  const newBreakpoint: Breakpoint = {
    id: randomUUID(),
    ...breakpoint,
  };

  const breakpoints = [...(existing?.breakpoints ?? []), newBreakpoint];

  return captureContext(sessionId, fileTree, environment, commandHistory, breakpoints, variableWatches);
}

export function removeBreakpoint(
  sessionId: string,
  breakpointId: string,
): ContextSnapshot {
  const existing = getLatestContextSnapshot(sessionId);
  const fileTree = existing?.fileTree ?? [];
  const environment = existing?.environment ?? {};
  const commandHistory = existing?.commandHistory ?? [];
  const variableWatches = existing?.variableWatches ?? [];

  const breakpoints = (existing?.breakpoints ?? []).filter((bp) => bp.id !== breakpointId);

  return captureContext(sessionId, fileTree, environment, commandHistory, breakpoints, variableWatches);
}

export function addVariableWatch(
  sessionId: string,
  watch: Omit<VariableWatch, "id">,
): ContextSnapshot {
  const existing = getLatestContextSnapshot(sessionId);
  const fileTree = existing?.fileTree ?? [];
  const environment = existing?.environment ?? {};
  const commandHistory = existing?.commandHistory ?? [];
  const breakpoints = existing?.breakpoints ?? [];

  const newWatch: VariableWatch = {
    id: randomUUID(),
    ...watch,
  };

  const variableWatches = [...(existing?.variableWatches ?? []), newWatch];

  return captureContext(sessionId, fileTree, environment, commandHistory, breakpoints, variableWatches);
}

export function removeVariableWatch(
  sessionId: string,
  watchId: string,
): ContextSnapshot {
  const existing = getLatestContextSnapshot(sessionId);
  const fileTree = existing?.fileTree ?? [];
  const environment = existing?.environment ?? {};
  const commandHistory = existing?.commandHistory ?? [];
  const breakpoints = existing?.breakpoints ?? [];

  const variableWatches = (existing?.variableWatches ?? []).filter((w) => w.id !== watchId);

  return captureContext(sessionId, fileTree, environment, commandHistory, breakpoints, variableWatches);
}

function mapRowToContextSnapshot(row: Record<string, unknown>): ContextSnapshot {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    fileTree: JSON.parse(row.file_tree as string),
    environment: JSON.parse(row.environment as string),
    commandHistory: JSON.parse(row.command_history as string),
    breakpoints: JSON.parse(row.breakpoints as string),
    variableWatches: JSON.parse(row.variable_watches as string),
    createdAt: row.created_at as string,
  };
}
