import { randomUUID } from "crypto";
import { run, all, get } from "./db";
import type {
  SharedSession,
  SessionStatus,
  CreateSessionInput,
  Participant,
  ParticipantRole,
  AccessLevel,
} from "./types";
import { broadcastSessionEvent, clearAllHandlers } from "./event-bus";

export function createSession(input: CreateSessionInput): SharedSession {
  const id = randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT INTO shared_sessions (id, name, description, status, owner_id, max_participants, is_encrypted, is_ephemeral, expires_at, metadata)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description ?? null,
      input.ownerId,
      input.maxParticipants ?? 10,
      input.isEncrypted ? 1 : 0,
      input.isEphemeral ? 1 : 0,
      input.expiresAt ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  run(
    `INSERT INTO participants (id, session_id, user_id, display_name, role, access_level, color)
     VALUES (?, ?, ?, ?, 'owner', 'edit', ?)`,
    [randomUUID(), id, input.ownerId, input.ownerId, generateColor()],
  );

  const session = getSession(id)!;
  broadcastSessionEvent({
    type: "session_created",
    sessionId: id,
    participantId: input.ownerId,
    timestamp: now,
    data: { name: input.name },
  });

  return session;
}

export function getSession(id: string): SharedSession | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM shared_sessions WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToSession(row);
}

export function listSessions(userId?: string, limit = 20): SharedSession[] {
  let query = "SELECT * FROM shared_sessions";
  const params: unknown[] = [];

  if (userId) {
    query = `
      SELECT ss.* FROM shared_sessions ss
      INNER JOIN participants p ON ss.id = p.session_id
      WHERE p.user_id = ?
      ORDER BY ss.updated_at DESC LIMIT ?
    `;
    params.push(userId, limit);
  } else {
    query += " ORDER BY updated_at DESC LIMIT ?";
    params.push(limit);
  }

  return all<Record<string, unknown>>(query, params).map(mapRowToSession);
}

export function updateSession(
  id: string,
  updates: Partial<Pick<SharedSession, "name" | "description" | "status" | "maxParticipants" | "expiresAt" | "metadata">>,
): SharedSession | null {
  const existing = getSession(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.maxParticipants !== undefined) {
    fields.push("max_participants = ?");
    values.push(updates.maxParticipants);
  }
  if (updates.expiresAt !== undefined) {
    fields.push("expires_at = ?");
    values.push(updates.expiresAt);
  }
  if (updates.metadata !== undefined) {
    fields.push("metadata = ?");
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) return existing;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  run(`UPDATE shared_sessions SET ${fields.join(", ")} WHERE id = ?`, values);

  const updated = getSession(id)!;
  broadcastSessionEvent({
    type: "session_updated",
    sessionId: id,
    timestamp: new Date().toISOString(),
    data: updates,
  });

  return updated;
}

export function deleteSession(id: string): boolean {
  const session = getSession(id);
  if (!session) return false;

  run("DELETE FROM shared_sessions WHERE id = ?", [id]);

  broadcastSessionEvent({
    type: "session_deleted",
    sessionId: id,
    timestamp: new Date().toISOString(),
    data: {},
  });

  return true;
}

export function endSession(id: string): SharedSession | null {
  return updateSession(id, { status: "ended" });
}

export function archiveSession(id: string): SharedSession | null {
  return updateSession(id, { status: "archived" });
}

export function getActiveSessions(): SharedSession[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM shared_sessions WHERE status = 'active' ORDER BY updated_at DESC",
  ).map(mapRowToSession);
}

export function getExpiringSessions(beforeDate: string): SharedSession[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM shared_sessions WHERE expires_at IS NOT NULL AND expires_at <= ? AND status = 'active'",
    [beforeDate],
  ).map(mapRowToSession);
}

function mapRowToSession(row: Record<string, unknown>): SharedSession {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    status: row.status as SessionStatus,
    ownerId: row.owner_id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expiresAt: row.expires_at as string | undefined,
    maxParticipants: row.max_participants as number,
    isEncrypted: (row.is_encrypted as number) === 1,
    isEphemeral: (row.is_ephemeral as number) === 1,
    metadata: JSON.parse((row.metadata as string) ?? "{}"),
  };
}

function generateColor(): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
    "#F8C471", "#82E0AA", "#F1948A", "#85929E", "#73C6B6",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
