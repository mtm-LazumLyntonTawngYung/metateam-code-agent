import { randomUUID } from "crypto";
import { run, all, get } from "./db";
import type { Conflict, ConflictResolution, SessionOperation } from "./types";
import { getOperation, getSessionOperations } from "./collaboration-service";
import { broadcastSessionEvent } from "./event-bus";

export function detectConflicts(sessionId: string, fileId: string): Conflict[] {
  const operations = getSessionOperations(sessionId, fileId)
    .filter((op) => op.applied)
    .sort((a, b) => a.version - b.version);

  const conflicts: Conflict[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < operations.length; i++) {
    for (let j = i + 1; j < operations.length; j++) {
      const op1 = operations[i];
      const op2 = operations[j];

      if (processed.has(op1.id) || processed.has(op2.id)) continue;

      if (hasConflict(op1, op2)) {
        const id = randomUUID();
        const now = new Date().toISOString();

        run(
          `INSERT INTO conflicts (id, session_id, operation_ids, file_id)
           VALUES (?, ?, ?, ?)`,
          [id, sessionId, JSON.stringify([op1.id, op2.id]), fileId],
        );

        const conflict = getConflict(id)!;
        conflicts.push(conflict);

        broadcastSessionEvent({
          type: "conflict",
          sessionId,
          timestamp: now,
          data: { conflictId: id, operationIds: [op1.id, op2.id] },
        });

        processed.add(op1.id);
        processed.add(op2.id);
      }
    }
  }

  return conflicts;
}

export function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
  resolvedBy: string,
): Conflict | null {
  const conflict = getConflict(conflictId);
  if (!conflict || conflict.resolvedAt) return null;

  const now = new Date().toISOString();

  run(
    `UPDATE conflicts SET resolved_at = ?, resolution = ?, resolved_by = ? WHERE id = ?`,
    [now, resolution, resolvedBy, conflictId],
  );

  const updated = getConflict(conflictId)!;

  broadcastSessionEvent({
    type: "conflict",
    sessionId: conflict.sessionId,
    timestamp: now,
    data: { conflictId, resolution, resolvedBy },
  });

  return updated;
}

export function autoResolveConflicts(sessionId: string): Conflict[] {
  const unresolved = getUnresolvedConflicts(sessionId);
  const resolved: Conflict[] = [];

  for (const conflict of unresolved) {
    const resolution = determineAutoResolution(conflict);
    const resolvedConflict = resolveConflict(conflict.id, resolution, "system");
    if (resolvedConflict) {
      resolved.push(resolvedConflict);
    }
  }

  return resolved;
}

export function getConflict(id: string): Conflict | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM conflicts WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToConflict(row);
}

export function getUnresolvedConflicts(sessionId: string): Conflict[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM conflicts WHERE session_id = ? AND resolved_at IS NULL",
    [sessionId],
  ).map(mapRowToConflict);
}

export function getSessionConflicts(sessionId: string): Conflict[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM conflicts WHERE session_id = ? ORDER BY detected_at DESC",
    [sessionId],
  ).map(mapRowToConflict);
}

export function getConflictHistory(sessionId: string): Conflict[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM conflicts WHERE session_id = ? AND resolved_at IS NOT NULL ORDER BY resolved_at DESC",
    [sessionId],
  ).map(mapRowToConflict);
}

function hasConflict(op1: SessionOperation, op2: SessionOperation): boolean {
  if (op1.fileId !== op2.fileId) return false;
  if (op1.participantId === op2.participantId) return false;

  const pos1 = op1.position;
  const pos2 = op2.position;
  const len1 = op1.content?.length ?? 0;
  const len2 = op2.content?.length ?? 0;

  if (op1.type === "insert" && op2.type === "insert") {
    return Math.abs(pos1 - pos2) <= 1;
  }

  if (op1.type === "delete" && op2.type === "delete") {
    return pos1 < pos2 + len2 && pos2 < pos1 + len1;
  }

  if (op1.type === "insert" && op2.type === "delete") {
    return pos1 >= pos2 && pos1 <= pos2 + len2;
  }

  if (op1.type === "delete" && op2.type === "insert") {
    return pos2 >= pos1 && pos2 <= pos1 + len1;
  }

  return false;
}

function determineAutoResolution(conflict: Conflict): ConflictResolution {
  const operations = conflict.operationIds.map((id) => getOperation(id)).filter(Boolean) as SessionOperation[];

  if (operations.length < 2) return "last-write-wins";

  const types = operations.map((op) => op.type);
  if (types.includes("insert") && types.includes("delete")) {
    return "manual";
  }

  return "last-write-wins";
}

function mapRowToConflict(row: Record<string, unknown>): Conflict {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    operationIds: JSON.parse(row.operation_ids as string),
    fileId: row.file_id as string,
    detectedAt: row.detected_at as string,
    resolvedAt: row.resolved_at as string | undefined,
    resolution: row.resolution as ConflictResolution | undefined,
    resolvedBy: row.resolved_by as string | undefined,
  };
}
