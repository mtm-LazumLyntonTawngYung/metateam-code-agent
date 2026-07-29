import { run, all } from "./db";

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
    [sessionId, filePath],
  );
  return rows.map((r) => ({
    patchId: r.id,
    content: r.new_content,
    createdAt: r.created_at,
  }));
}
