import { run, all, get } from "./db";

export type EpochRow = {
  id: number;
  session_id: string;
  epoch_no: number;
  pruned_until: number | null;
  reason: string;
  token_count: number;
  created_at: string;
};

export const EPOCH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS epochs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    epoch_no INTEGER NOT NULL,
    pruned_until INTEGER,
    reason TEXT NOT NULL,
    token_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`;

export function bumpEpoch(
  sessionId: string,
  prunedUntil: number | null,
  reason: string,
  tokenCount = 0,
): EpochRow {
  const latest = getLatestEpoch(sessionId);
  const epochNo = (latest?.epoch_no ?? 0) + 1;
  const result = run(
    `INSERT INTO epochs (session_id, epoch_no, pruned_until, reason, token_count)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, epochNo, prunedUntil, reason, tokenCount],
  );
  return {
    id: result.lastInsertRowid,
    session_id: sessionId,
    epoch_no: epochNo,
    pruned_until: prunedUntil,
    reason,
    token_count: tokenCount,
    created_at: new Date().toISOString(),
  };
}

export function getLatestEpoch(sessionId: string): EpochRow | null {
  return get<EpochRow>(
    "SELECT * FROM epochs WHERE session_id = ? ORDER BY epoch_no DESC LIMIT 1",
    [sessionId],
  );
}

export function listEpochs(sessionId: string): EpochRow[] {
  return all<EpochRow>(
    "SELECT * FROM epochs WHERE session_id = ? ORDER BY epoch_no ASC",
    [sessionId],
  );
}

export function safeBoundarySystemMessage(sessionId: string): string | null {
  const epoch = getLatestEpoch(sessionId);
  if (!epoch) return null;
  if (epoch.pruned_until == null) return null;
  return [
    `[Context epoch ${epoch.epoch_no}]`,
    `A context rotation occurred at message id ${epoch.pruned_until} (${epoch.reason}).`,
    "Messages before this boundary were condensed into a summary; their exact text is no longer available.",
    "Do not fabricate details from before the boundary. If you need information from a pruned message, request a re-run of the relevant tool call.",
  ].join("\n");
}
