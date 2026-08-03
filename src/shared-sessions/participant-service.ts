import { randomUUID } from "crypto";
import { run, all, get } from "./db";
import type {
  Participant,
  ParticipantRole,
  AccessLevel,
  ConnectionStatus,
  CursorPosition,
  SelectionRange,
  JoinSessionInput,
} from "./types";
import { getSession } from "./session-service";
import { broadcastSessionEvent } from "./event-bus";

const PARTICIPANT_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
  "#F8C471", "#82E0AA", "#F1948A", "#85929E", "#73C6B6",
];

export function joinSession(input: JoinSessionInput): Participant | null {
  const session = getSession(input.sessionId);
  if (!session || session.status !== "active") return null;

  const existingParticipant = getParticipantByUser(input.sessionId, input.userId);
  if (existingParticipant) return existingParticipant;

  const participantCount = countParticipants(input.sessionId);
  if (participantCount >= session.maxParticipants) return null;

  const id = randomUUID();
  const now = new Date().toISOString();
  const color = PARTICIPANT_COLORS[participantCount % PARTICIPANT_COLORS.length];

  run(
    `INSERT INTO participants (id, session_id, user_id, display_name, role, access_level, color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      input.userId,
      input.displayName,
      input.role ?? "viewer",
      input.accessLevel ?? "read-only",
      color,
    ],
  );

  const participant = getParticipant(id)!;

  broadcastSessionEvent({
    type: "participant_joined",
    sessionId: input.sessionId,
    participantId: id,
    timestamp: now,
    data: { userId: input.userId, displayName: input.displayName },
  });

  return participant;
}

export function leaveSession(sessionId: string, userId: string): boolean {
  const participant = getParticipantByUser(sessionId, userId);
  if (!participant) return false;

  run("DELETE FROM participants WHERE id = ?", [participant.id]);

  broadcastSessionEvent({
    type: "participant_left",
    sessionId,
    participantId: participant.id,
    timestamp: new Date().toISOString(),
    data: { userId },
  });

  return true;
}

export function getParticipant(id: string): Participant | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM participants WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToParticipant(row);
}

export function getParticipantByUser(sessionId: string, userId: string): Participant | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM participants WHERE session_id = ? AND user_id = ?",
    [sessionId, userId],
  );
  if (!row) return null;
  return mapRowToParticipant(row);
}

export function getSessionParticipants(sessionId: string): Participant[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at ASC",
    [sessionId],
  ).map(mapRowToParticipant);
}

export function countParticipants(sessionId: string): number {
  const row = get<{ count: number }>(
    "SELECT COUNT(*) as count FROM participants WHERE session_id = ?",
    [sessionId],
  );
  return row?.count ?? 0;
}

export function updateParticipantRole(
  sessionId: string,
  participantId: string,
  role: ParticipantRole,
  accessLevel: AccessLevel,
): Participant | null {
  const participant = getParticipant(participantId);
  if (!participant || participant.sessionId !== sessionId) return null;

  run(
    "UPDATE participants SET role = ?, access_level = ? WHERE id = ?",
    [role, accessLevel, participantId],
  );

  return getParticipant(participantId);
}

export function updateConnectionStatus(
  participantId: string,
  status: ConnectionStatus,
): Participant | null {
  const participant = getParticipant(participantId);
  if (!participant) return null;

  run(
    "UPDATE participants SET connection_status = ?, last_active_at = datetime('now') WHERE id = ?",
    [status, participantId],
  );

  return getParticipant(participantId);
}

export function updateCursorPosition(
  participantId: string,
  cursor: CursorPosition,
): Participant | null {
  const participant = getParticipant(participantId);
  if (!participant) return null;

  run(
    "UPDATE participants SET cursor = ?, last_active_at = datetime('now') WHERE id = ?",
    [JSON.stringify(cursor), participantId],
  );

  return getParticipant(participantId);
}

export function updateSelection(
  participantId: string,
  selection: SelectionRange | null,
): Participant | null {
  const participant = getParticipant(participantId);
  if (!participant) return null;

  run(
    "UPDATE participants SET selection = ?, last_active_at = datetime('now') WHERE id = ?",
    [selection ? JSON.stringify(selection) : null, participantId],
  );

  return getParticipant(participantId);
}

export function removeInactiveParticipants(sessionId: string, inactiveThresholdMs: number): string[] {
  const threshold = new Date(Date.now() - inactiveThresholdMs).toISOString();
  const inactive = all<Record<string, unknown>>(
    "SELECT * FROM participants WHERE session_id = ? AND last_active_at < ? AND role != 'owner'",
    [sessionId, threshold],
  );

  const removedIds: string[] = [];
  for (const row of inactive) {
    run("DELETE FROM participants WHERE id = ?", [row.id]);
    removedIds.push(row.id as string);

    broadcastSessionEvent({
      type: "participant_left",
      sessionId,
      participantId: row.id as string,
      timestamp: new Date().toISOString(),
      data: { reason: "inactive" },
    });
  }

  return removedIds;
}

function mapRowToParticipant(row: Record<string, unknown>): Participant {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    userId: row.user_id as string,
    displayName: row.display_name as string,
    role: row.role as ParticipantRole,
    accessLevel: row.access_level as AccessLevel,
    connectionStatus: row.connection_status as ConnectionStatus,
    joinedAt: row.joined_at as string,
    lastActiveAt: row.last_active_at as string,
    cursor: row.cursor ? JSON.parse(row.cursor as string) : undefined,
    selection: row.selection ? JSON.parse(row.selection as string) : undefined,
    color: row.color as string,
  };
}
