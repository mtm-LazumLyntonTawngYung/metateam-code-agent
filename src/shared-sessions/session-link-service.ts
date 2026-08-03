import { randomUUID, randomBytes } from "crypto";
import { run, all, get } from "./db";
import type { SessionLink, AccessLevel, SessionLinkInput } from "./types";
import { getSession } from "./session-service";
import { canPerformAction } from "./permission-engine";

export function createSessionLink(input: SessionLinkInput): SessionLink | null {
  if (!canPerformAction(input.sessionId, input.createdBy, "manage")) {
    return null;
  }

  const session = getSession(input.sessionId);
  if (!session || session.status !== "active") return null;

  const id = randomUUID();
  const token = generateSecureToken();
  const now = new Date().toISOString();

  run(
    `INSERT INTO session_links (id, session_id, token, access_level, expires_at, max_uses, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      token,
      input.accessLevel,
      input.expiresAt ?? null,
      input.maxUses ?? null,
      input.createdBy,
    ],
  );

  return getSessionLink(id);
}

export function validateSessionLink(token: string): { link: SessionLink; sessionId: string } | null {
  const link = getSessionLinkByToken(token);
  if (!link || !link.isValid) return null;

  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    invalidateSessionLink(link.id);
    return null;
  }

  if (link.maxUses && link.currentUses >= link.maxUses) {
    invalidateSessionLink(link.id);
    return null;
  }

  run(
    "UPDATE session_links SET current_uses = current_uses + 1 WHERE id = ?",
    [link.id],
  );

  return { link: getSessionLink(link.id)!, sessionId: link.sessionId };
}

export function invalidateSessionLink(linkId: string): boolean {
  const link = getSessionLink(linkId);
  if (!link) return false;

  run("UPDATE session_links SET is_valid = 0 WHERE id = ?", [linkId]);
  return true;
}

export function invalidateAllSessionLinks(sessionId: string): number {
  const result = run(
    "UPDATE session_links SET is_valid = 0 WHERE session_id = ?",
    [sessionId],
  );
  return result.changes;
}

export function getSessionLink(id: string): SessionLink | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM session_links WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return mapRowToSessionLink(row);
}

export function getSessionLinkByToken(token: string): SessionLink | null {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM session_links WHERE token = ?",
    [token],
  );
  if (!row) return null;
  return mapRowToSessionLink(row);
}

export function getSessionLinks(sessionId: string): SessionLink[] {
  return all<Record<string, unknown>>(
    "SELECT * FROM session_links WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId],
  ).map(mapRowToSessionLink);
}

export function cleanupExpiredLinks(): number {
  const now = new Date().toISOString();
  const result = run(
    "UPDATE session_links SET is_valid = 0 WHERE expires_at IS NOT NULL AND expires_at <= ?",
    [now],
  );
  return result.changes;
}

function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

function mapRowToSessionLink(row: Record<string, unknown>): SessionLink {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    token: row.token as string,
    accessLevel: row.access_level as AccessLevel,
    expiresAt: row.expires_at as string | undefined,
    maxUses: row.max_uses as number | undefined,
    currentUses: row.current_uses as number,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    isValid: (row.is_valid as number) === 1,
  };
}
