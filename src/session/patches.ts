import { run, all } from "./db";
import { AsyncLocalStorage } from "node:async_hooks";
import { writeFileSync } from "fs";
import { resolve } from "path";

export type PatchRow = {
  id: number;
  session_id: string;
  file_path: string;
  original_content: string;
  new_content: string;
  tool_name: string | null;
  tool_args: string | null;
  created_at: string;
};

export type FileVersion = {
  patchId: number;
  content: string;
  createdAt: string;
};

export function savePatch(
  sessionId: string,
  filePath: string,
  originalContent: string,
  newContent: string,
  toolName?: string,
  toolArgs?: unknown,
): number {
  const result = run(
    `INSERT INTO patches (session_id, file_path, original_content, new_content, tool_name, tool_args)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      filePath,
      originalContent,
      newContent,
      toolName ?? null,
      toolArgs ? JSON.stringify(toolArgs) : null,
    ],
  );
  return result.lastInsertRowid;
}

export function getPatches(sessionId: string): PatchRow[] {
  return all<PatchRow>(
    "SELECT * FROM patches WHERE session_id = ? ORDER BY created_at DESC, id DESC",
    [sessionId],
  );
}

export function getFileVersions(
  sessionId: string,
  filePath: string,
): FileVersion[] {
  const rows = all<{
    id: number;
    new_content: string;
    created_at: string;
  }>(
    "SELECT id, new_content, created_at FROM patches WHERE session_id = ? AND file_path = ? ORDER BY created_at ASC, id ASC",
    [sessionId, normalizePath(filePath)],
  );
  return rows.map((r) => ({
    patchId: r.id,
    content: r.new_content,
    createdAt: r.created_at,
  }));
}

export function getPatchesForFile(
  sessionId: string,
  filePath: string,
): PatchRow[] {
  return all<PatchRow>(
    "SELECT * FROM patches WHERE session_id = ? AND file_path = ? ORDER BY created_at ASC, id ASC",
    [sessionId, normalizePath(filePath)],
  );
}

function normalizePath(p: string): string {
  try {
    return resolve(p);
  } catch {
    return p;
  }
}

type PatchContext = {
  sessionId: string;
};

const patchContext = new AsyncLocalStorage<PatchContext>();

/**
 * Runs `fn` with the given session id as the active patch context. Tools that
 * mutate files call `recordPatch` (see below) to capture a before/after
 * checkpoint associated with that session.
 */
export function withPatchContext<T>(
  sessionId: string,
  fn: () => T,
): T {
  const store: PatchContext = { sessionId };
  return patchContext.run(store, fn) as T;
}

export function getPatchSessionId(): string | null {
  return patchContext.getStore()?.sessionId ?? null;
}

/**
 * Records a checkpoint when a tool rewrites a file, but only if a session is
 * active in the current patch context (set by the agent loop). Falls back to
 * the explicit sessionId argument when provided.
 */
export function recordPatch(
  filePath: string,
  originalContent: string,
  newContent: string,
  toolName?: string,
  toolArgs?: unknown,
  sessionId?: string,
): number | null {
  const sid = sessionId ?? getPatchSessionId();
  if (!sid) return null;
  return savePatch(sid, filePath, originalContent, newContent, toolName, toolArgs);
}

export type RevertResult =
  | { ok: true; content: string; restoredVersion: number }
  | { ok: false; error: string };

/**
 * Restores a file to an earlier recorded state.
 *
 * @param sessionId  Session whose patch history is used.
 * @param filePath   File to restore (path is resolved against cwd).
 * @param version    0 = the content as it was BEFORE this session's first edit;
 *                   1..N = the content after the Nth recorded edit (oldest first).
 */
export function revertFileToVersion(
  sessionId: string,
  filePath: string,
  version: number,
): RevertResult {
  const rows = all<{
    original_content: string;
    new_content: string;
  }>(
    "SELECT original_content, new_content FROM patches WHERE session_id = ? AND file_path = ? ORDER BY created_at ASC, id ASC",
    [sessionId, normalizePath(filePath)],
  );

  if (rows.length === 0) {
    return { ok: false, error: `No recorded patches for '${filePath}' in session ${sessionId}` };
  }

  let content: string;
  let restoredVersion: number;
  if (version <= 0) {
    content = rows[0].original_content;
    restoredVersion = 0;
  } else if (version <= rows.length) {
    content = rows[version - 1].new_content;
    restoredVersion = version;
  } else {
    return {
      ok: false,
      error: `Version ${version} is out of range. Only ${rows.length} recorded state(s) exist for '${filePath}' (use 0 for original, 1..${rows.length} for edits).`,
    };
  }

  const abs = resolve(filePath);
  try {
    writeFileSync(abs, content, "utf-8");
    return { ok: true, content, restoredVersion };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write restored content to ${abs}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
