/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { getDb } from "../session/db";
import { getLicense } from "./license";
import type { AuditEvent } from "./types";
import { hasFeature } from "./license";
import { broadcastAudit } from "./realtime";

let auditDbInitialized = false;

function ensureAuditDb(): void {
  if (auditDbInitialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT DEFAULT (datetime('now')),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail TEXT DEFAULT '',
      ip TEXT,
      session_id TEXT
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp
    ON audit_log(timestamp DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON audit_log(actor)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_action
    ON audit_log(action)
  `);
  auditDbInitialized = true;
}

export function recordAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">): void {
  const license = getLicense();
  if (license.tier === "community") return;

  ensureAuditDb();
  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  db.run(
    "INSERT INTO audit_log (id, timestamp, actor, action, resource, detail, ip, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, timestamp, event.actor, event.action, event.resource, event.detail, event.ip ?? null, event.sessionId ?? null],
  );

  broadcastAudit({
    id,
    timestamp,
    actor: event.actor,
    action: event.action,
    resource: event.resource,
    detail: event.detail,
    ip: event.ip,
    sessionId: event.sessionId,
  });
}

export function queryAuditLogs(options: {
  limit?: number;
  offset?: number;
  actor?: string;
  action?: string;
  since?: string;
  until?: string;
}): AuditEvent[] {
  ensureAuditDb();
  const db = getDb();
  const conditions: string[] = [];
  const params: string[] = [];

  if (options.actor) {
    conditions.push("actor = ?");
    params.push(options.actor);
  }
  if (options.action) {
    conditions.push("action = ?");
    params.push(options.action);
  }
  if (options.since) {
    conditions.push("timestamp >= ?");
    params.push(options.since);
  }
  if (options.until) {
    conditions.push("timestamp <= ?");
    params.push(options.until);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const rows = db.query(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, String(limit), String(offset)) as Array<{
    id: string; timestamp: string; actor: string; action: string;
    resource: string; detail: string; ip: string | null; session_id: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    actor: r.actor,
    action: r.action,
    resource: r.resource,
    detail: r.detail,
    ip: r.ip ?? undefined,
    sessionId: r.session_id ?? undefined,
  }));
}

export function getAuditStats(): { total: number; uniqueActors: number; topActions: Array<{ action: string; count: number }> } {
  ensureAuditDb();
  const db = getDb();
  const total = (db.query("SELECT COUNT(*) as count FROM audit_log").get() as { count: number }).count;
  const uniqueActors = (db.query("SELECT COUNT(DISTINCT actor) as count FROM audit_log").get() as { count: number }).count;
  const topActions = db.query("SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC LIMIT 10").all() as Array<{ action: string; count: number }>;

  return { total, uniqueActors, topActions };
}

export function clearAuditLogs(beforeDays?: number): number {
  ensureAuditDb();
  const db = getDb();
  if (beforeDays) {
    const cutoff = new Date(Date.now() - beforeDays * 24 * 3600 * 1000).toISOString();
    const result = db.run("DELETE FROM audit_log WHERE timestamp < ?", [cutoff]);
    return result.changes;
  }
  const result = db.run("DELETE FROM audit_log");
  return result.changes;
}
