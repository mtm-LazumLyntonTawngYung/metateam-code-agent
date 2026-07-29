import { randomUUID } from "crypto";
import { run, all, get } from "./db";
import { countTokens } from "./tokens";

export type MessageRole = "user" | "assistant" | "tool" | "system";

export type MessageRow = {
  id: number;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_name: string | null;
  tool_args: string | null;
  tool_result: string | null;
  token_count: number;
  created_at: string;
  pruned: number;
};

export type SessionRow = {
  id: string;
  label: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
};

export function createSession(label?: string): string {
  const id = randomUUID();
  run("INSERT INTO sessions (id, label, metadata) VALUES (?, ?, ?)", [
    id,
    label ?? null,
    "{}",
  ]);
  return id;
}

export function getSession(id: string): SessionRow | null {
  return get<SessionRow>("SELECT * FROM sessions WHERE id = ?", [id]);
}

export function listSessions(limit = 20): SessionRow[] {
  return all<SessionRow>(
    "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?",
    [limit],
  );
}

export function deleteSession(id: string): void {
  run("DELETE FROM messages WHERE session_id = ?", [id]);
  run("DELETE FROM patches WHERE session_id = ?", [id]);
  run("DELETE FROM summaries WHERE session_id = ?", [id]);
  run("DELETE FROM sessions WHERE id = ?", [id]);
}

export function touchSession(id: string): void {
  run("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", [id]);
}

export function addMessage(
  sessionId: string,
  role: MessageRole,
  content: string,
  opts?: {
    tool_name?: string;
    tool_args?: unknown;
    tool_result?: string;
  },
): number {
  const tokens = countTokens(content);
  const result = run(
    `INSERT INTO messages (session_id, role, content, tool_name, tool_args, tool_result, token_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      role,
      content,
      opts?.tool_name ?? null,
      opts?.tool_args ? JSON.stringify(opts.tool_args) : null,
      opts?.tool_result ?? null,
      tokens,
    ],
  );
  touchSession(sessionId);
  return result.lastInsertRowid;
}

export function getMessages(
  sessionId: string,
  includePruned = false,
): MessageRow[] {
  const query = includePruned
    ? "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC"
    : "SELECT * FROM messages WHERE session_id = ? AND pruned = 0 ORDER BY created_at ASC, id ASC";
  return all<MessageRow>(query, [sessionId]);
}

export function countSessionTokens(sessionId: string): number {
  const row = get<{ total: number }>(
    "SELECT COALESCE(SUM(token_count), 0) AS total FROM messages WHERE session_id = ? AND pruned = 0",
    [sessionId],
  );
  return row?.total ?? 0;
}
