/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { createHash } from "crypto";
import { getDb } from "../session/db";
import { getLicense } from "./license";
import type { AuditEvent } from "./types";
import { hasFeature } from "./license";
import { broadcastAudit } from "./realtime";

let auditDbInitialized = false;

function columnExists(table: string, column: string): boolean {
  const rows = getDb().query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

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
  if (!columnExists("audit_log", "hash")) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN prev_hash TEXT`);
    db.exec(`ALTER TABLE audit_log ADD COLUMN hash TEXT`);
    backfillAuditChain();
  }
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

type AuditChainSource = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  detail: string;
};

export type AuditChainEntry = AuditChainSource & {
  prevHash: string | null;
  hash: string;
};

export function computeAuditHash(prevHash: string, entry: AuditChainSource): string {
  const fields = [entry.id, entry.timestamp, entry.actor, entry.action, entry.resource, entry.detail].join("|");
  return createHash("sha256").update(`${prevHash}\n${fields}`).digest("hex");
}

export function buildAuditChain(entries: AuditChainSource[]): AuditChainEntry[] {
  let prev = "";
  return entries.map((entry) => {
    const hash = computeAuditHash(prev, entry);
    const out: AuditChainEntry = { ...entry, prevHash: prev || null, hash };
    prev = hash;
    return out;
  });
}

export function verifyAuditChain(entries: AuditChainEntry[]): { valid: boolean; brokenIndex: number | null } {
  let prev = "";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if ((entry.prevHash ?? "") !== prev) return { valid: false, brokenIndex: i };
    const recomputed = computeAuditHash(prev, entry);
    if (entry.hash !== recomputed) return { valid: false, brokenIndex: i };
    prev = recomputed;
  }
  return { valid: true, brokenIndex: null };
}

function backfillAuditChain(): void {
  const db = getDb();
  const rows = db.query(
    "SELECT id, timestamp, actor, action, resource, detail FROM audit_log ORDER BY timestamp ASC, id ASC",
  ).all() as Array<{ id: string; timestamp: string; actor: string; action: string; resource: string; detail: string }>;
  const chain = buildAuditChain(rows);
  for (const entry of chain) {
    db.run("UPDATE audit_log SET prev_hash = ?, hash = ? WHERE id = ?", [entry.prevHash, entry.hash, entry.id]);
  }
}

function lastAuditHash(): string {
  const row = getDb().query(
    "SELECT hash FROM audit_log WHERE hash IS NOT NULL ORDER BY timestamp DESC, id DESC LIMIT 1",
  ).get() as { hash: string } | null;
  return row?.hash ?? "";
}

export function recordAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">): void {
  const license = getLicense();
  if (license.tier === "community") return;

  ensureAuditDb();
  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const prevHash = lastAuditHash();
  const hash = computeAuditHash(prevHash, { id, timestamp, actor: event.actor, action: event.action, resource: event.resource, detail: event.detail });

  db.run(
    "INSERT INTO audit_log (id, timestamp, actor, action, resource, detail, ip, session_id, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, timestamp, event.actor, event.action, event.resource, event.detail, event.ip ?? null, event.sessionId ?? null, prevHash || null, hash],
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

export function verifyAuditIntegrity(): {
  valid: boolean;
  brokenIndex: number | null;
  total: number;
  verified: number;
  legacy: number;
} {
  ensureAuditDb();
  const rows = getDb().query(
    "SELECT id, timestamp, actor, action, resource, detail, prev_hash, hash FROM audit_log ORDER BY timestamp ASC, id ASC",
  ).all() as Array<{
    id: string; timestamp: string; actor: string; action: string; resource: string;
    detail: string; prev_hash: string | null; hash: string | null;
  }>;
  const total = rows.length;
  if (total === 0) return { valid: true, brokenIndex: null, total, verified: 0, legacy: 0 };

  const legacy = rows.filter((r) => !r.hash).length;
  if (legacy > 0) {
    return { valid: false, brokenIndex: rows.findIndex((r) => !r.hash), total, verified: total - legacy, legacy };
  }

  const entries: AuditChainEntry[] = rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    actor: r.actor,
    action: r.action,
    resource: r.resource,
    detail: r.detail,
    prevHash: r.prev_hash,
    hash: r.hash as string,
  }));
  const result = verifyAuditChain(entries);
  return { ...result, total, verified: total, legacy: 0 };
}
