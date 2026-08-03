import { randomUUID } from "crypto";
import { run, all, get } from "./db";
import type {
  SessionOperation,
  OperationType,
  OperationInput,
  SessionSnapshot,
  Conflict,
  ConflictResolution,
} from "./types";
import { getSession } from "./session-service";
import { getParticipant, updateCursorPosition, updateSelection } from "./participant-service";
import { canPerformAction } from "./permission-engine";
import { broadcastSessionEvent } from "./event-bus";

const VERSION_KEY = "session_version";

export function applyOperation(input: OperationInput): SessionOperation | null {
  const session = getSession(input.sessionId);
  if (!session || session.status !== "active") return null;

  const participant = getParticipant(input.participantId);
  if (!participant || participant.sessionId !== input.sessionId) return null;

  if (!canPerformAction(input.sessionId, participant.userId, "edit")) {
    return null;
  }

  const version = getNextVersion(input.sessionId);
  const id = randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT INTO session_operations (id, session_id, participant_id, type, file_id, position, content, version, applied)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      input.sessionId,
      input.participantId,
      input.type,
      input.fileId,
      input.position,
      input.content ?? null,
      version,
    ],
  );

  const operation = getOperation(id)!;

  broadcastSessionEvent({
    type: "operation",
    sessionId: input.sessionId,
    participantId: input.participantId,
    timestamp: now,
    data: {
      operationId: id,
      type: input.type,
      fileId: input.fileId,
      position: input.position,
      version,
    },
  });

  return operation;
}

export function getOperation(id: string): SessionOperation | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM session_operations WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToOperation(row);
}

export function getSessionOperations(
  sessionId: string,
  fileId?: string,
  sinceVersion?: number,
): SessionOperation[] {
  let query = "SELECT * FROM session_operations WHERE session_id = ?";
  const params: unknown[] = [sessionId];

  if (fileId) {
    query += " AND file_id = ?";
    params.push(fileId);
  }

  if (sinceVersion !== undefined) {
    query += " AND version > ?";
    params.push(sinceVersion);
  }

  query += " ORDER BY version ASC, timestamp ASC";

  return all<Record<string, unknown>>(query, params).map(mapRowToOperation);
}

export function getCurrentVersion(sessionId: string): number {
  const row = get<{ value: string | number }>(
    `SELECT value FROM metadata WHERE key = ? AND session_id = ?`,
    [VERSION_KEY, sessionId],
  );
  return row ? Number(row.value) : 0;
}

function getNextVersion(sessionId: string): number {
  const current = getCurrentVersion(sessionId);
  const next = current + 1;

  const existing = get<{ session_id: string }>(
    "SELECT session_id FROM metadata WHERE key = ? AND session_id = ?",
    [VERSION_KEY, sessionId],
  );

  if (existing) {
    run(
      "UPDATE metadata SET value = ? WHERE key = ? AND session_id = ?",
      [next, VERSION_KEY, sessionId],
    );
  } else {
    run(
      "INSERT INTO metadata (session_id, key, value) VALUES (?, ?, ?)",
      [sessionId, VERSION_KEY, next],
    );
  }

  return next;
}

export function createSnapshot(
  sessionId: string,
  createdBy: string,
  files: Record<string, string>,
): SessionSnapshot {
  const id = randomUUID();
  const version = getCurrentVersion(sessionId);
  const now = new Date().toISOString();

  run(
    `INSERT INTO session_snapshots (id, session_id, version, files, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, sessionId, version, JSON.stringify(files), createdBy],
  );

  return getSnapshot(id)!;
}

export function getSnapshot(id: string): SessionSnapshot | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM session_snapshots WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToSnapshot(row);
}

export function getSessionSnapshots(sessionId: string): SessionSnapshot[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY version DESC",
    [sessionId],
  ).map(mapRowToSnapshot);
}

export function getLatestSnapshot(sessionId: string): SessionSnapshot | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY version DESC LIMIT 1",
    [sessionId],
  );
  if (!row) return null;
  return mapRowToSnapshot(row);
}

export function transformOperation(
  base: SessionOperation | null,
  concurrent: SessionOperation | null,
): SessionOperation | null {
  if (!base || !concurrent) return base ?? concurrent;
  if (base.fileId !== concurrent.fileId) return base;

  if (base.type === "insert" && concurrent.type === "insert") {
    if (base.position <= concurrent.position) {
      return { ...concurrent, position: concurrent.position + (base.content?.length ?? 0) };
    }
  }

  if (base.type === "delete" && concurrent.type === "insert") {
    if (base.position <= concurrent.position) {
      return { ...concurrent, position: Math.max(0, concurrent.position - (base.content?.length ?? 0)) };
    }
  }

  if (base.type === "insert" && concurrent.type === "delete") {
    if (base.position <= concurrent.position) {
      return { ...concurrent, position: concurrent.position + (base.content?.length ?? 0) };
    }
  }

  if (base.type === "delete" && concurrent.type === "delete") {
    if (base.position < concurrent.position) {
      return { ...concurrent, position: Math.max(0, concurrent.position - (base.content?.length ?? 0)) };
    }
  }

  return base;
}

function mapRowToOperation(row: Record<string, unknown>): SessionOperation {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    participantId: row.participant_id as string,
    type: row.type as OperationType,
    fileId: row.file_id as string,
    position: row.position as number,
    content: row.content as string | undefined,
    timestamp: row.timestamp as string,
    version: row.version as number,
    applied: (row.applied as number) === 1,
  };
}

function mapRowToSnapshot(row: Record<string, unknown>): SessionSnapshot {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    version: row.version as number,
    files: JSON.parse(row.files as string),
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
  };
}
