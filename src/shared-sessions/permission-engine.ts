import { randomUUID } from "crypto";
import { run, all, get } from "./db";
import type {
  Permission,
  AccessLevel,
  ParticipantRole,
  PermissionInput,
} from "./types";
import { getParticipant, getParticipantByUser } from "./participant-service";
import { getSession } from "./session-service";

const ROLE_HIERARCHY: Record<ParticipantRole, number> = {
  owner: 5,
  admin: 4,
  editor: 3,
  viewer: 2,
  guest: 1,
};

const ACCESS_HIERARCHY: Record<AccessLevel, number> = {
  edit: 3,
  "comment-only": 2,
  "read-only": 1,
};

export function grantPermission(input: PermissionInput): Permission | null {
  const participant = getParticipant(input.participantId);
  if (!participant || participant.sessionId !== input.sessionId) return null;

  const id = randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT INTO permissions (id, session_id, participant_id, access_level, domain, granted_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      input.participantId,
      input.accessLevel,
      input.domain ?? null,
      input.grantedBy,
      input.expiresAt ?? null,
    ],
  );

  return getPermission(id);
}

export function revokePermission(permissionId: string): boolean {
  const permission = getPermission(permissionId);
  if (!permission) return false;

  run("DELETE FROM permissions WHERE id = ?", [permissionId]);
  return true;
}

export function getPermission(id: string): Permission | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM permissions WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToPermission(row);
}

export function getSessionPermissions(sessionId: string): Permission[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM permissions WHERE session_id = ?",
    [sessionId],
  ).map(mapRowToPermission);
}

export function getParticipantPermissions(participantId: string): Permission[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM permissions WHERE participant_id = ?",
    [participantId],
  ).map(mapRowToPermission);
}

export function validateAccess(
  sessionId: string,
  userId: string,
  requiredAccess: AccessLevel,
  domain?: string,
): boolean {
  const participant = getParticipantByUser(sessionId, userId);
  if (!participant) return false;

  const roleLevel = ROLE_HIERARCHY[participant.role] ?? 0;
  const requiredLevel = ACCESS_HIERARCHY[requiredAccess] ?? 0;

  if (roleLevel >= ROLE_HIERARCHY.editor) return true;

  const participantAccessLevel = ACCESS_HIERARCHY[participant.accessLevel] ?? 0;
  if (participantAccessLevel >= requiredLevel) {
    if (domain) {
      return hasDomainAccess(sessionId, participant.id, domain);
    }
    return true;
  }

  return false;
}

export function hasDomainAccess(
  sessionId: string,
  participantId: string,
  domain: string,
): boolean {
  const permissions = all<Record<string, unknown>>(
    "SELECT * FROM permissions WHERE session_id = ? AND participant_id = ? AND domain IS NOT NULL",
    [sessionId, participantId],
  ).map(mapRowToPermission);

  if (permissions.length === 0) return true;

  return permissions.some((p) => domain.startsWith(p.domain ?? ""));
}

export function canPerformAction(
  sessionId: string,
  userId: string,
  action: "read" | "comment" | "edit" | "manage",
): boolean {
  const participant = getParticipantByUser(sessionId, userId);
  if (!participant) return false;

  const roleLevel = ROLE_HIERARCHY[participant.role] ?? 0;

  switch (action) {
    case "read":
      return true;
    case "comment":
      return roleLevel >= ROLE_HIERARCHY.guest || participant.accessLevel !== "read-only";
    case "edit":
      return roleLevel >= ROLE_HIERARCHY.editor || participant.accessLevel === "edit";
    case "manage":
      return roleLevel >= ROLE_HIERARCHY.admin;
    default:
      return false;
  }
}

export function getEffectiveAccessLevel(
  sessionId: string,
  userId: string,
): AccessLevel {
  const participant = getParticipantByUser(sessionId, userId);
  if (!participant) return "read-only";

  const roleLevel = ROLE_HIERARCHY[participant.role] ?? 0;
  if (roleLevel >= ROLE_HIERARCHY.editor) return "edit";

  return participant.accessLevel;
}

export function cleanupExpiredPermissions(): number {
  const now = new Date().toISOString();
  const result = run(
    "DELETE FROM permissions WHERE expires_at IS NOT NULL AND expires_at <= ?",
    [now],
  );
  return result.changes;
}

function mapRowToPermission(row: Record<string, unknown>): Permission {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    participantId: row.participant_id as string,
    accessLevel: row.access_level as AccessLevel,
    domain: row.domain as string | undefined,
    grantedAt: row.granted_at as string,
    grantedBy: row.granted_by as string,
    expiresAt: row.expires_at as string | undefined,
  };
}
