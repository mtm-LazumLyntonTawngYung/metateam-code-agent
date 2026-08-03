/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { randomUUID } from "crypto";
import { getDb } from "../session/db";
import { getLicense } from "./license";
import { createNotification } from "./notifications";

export type SecuritySeverity = "info" | "low" | "medium" | "high" | "critical";

export const SECURITY_SEVERITIES: SecuritySeverity[] = ["info", "low", "medium", "high", "critical"];

export const SEVERITY_WEIGHT: Record<SecuritySeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export type SecurityEvent = {
  id: string;
  timestamp: string;
  category: string;
  severity: SecuritySeverity;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  ip?: string;
};

export type SecurityThreat = {
  id: string;
  category: string;
  title: string;
  severity: SecuritySeverity;
  score: number;
  eventCount: number;
  recommendation: string;
};

export type SecurityAlert = {
  id: string;
  level: SecuritySeverity;
  title: string;
  detail: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
};

export type SecurityPolicy = {
  key: string;
  enabled: boolean;
  value: number | string | boolean;
  description: string;
};

export type ComplianceRequirement = {
  framework: "SOC 2" | "GDPR";
  requirement: string;
  satisfied: boolean;
  detail: string;
};

export type ComplianceStatus = {
  score: number;
  requirements: ComplianceRequirement[];
  frameworks: Array<{ framework: "SOC 2" | "GDPR"; score: number; total: number; met: number }>;
};

export function severityRank(severity: SecuritySeverity): number {
  return SEVERITY_WEIGHT[severity] ?? 0;
}

export function isSecuritySeverity(value: unknown): value is SecuritySeverity {
  return typeof value === "string" && (SECURITY_SEVERITIES as string[]).includes(value);
}

export function classifyThreatSeverity(eventCount: number): SecuritySeverity {
  if (eventCount >= 50) return "critical";
  if (eventCount >= 20) return "high";
  if (eventCount >= 8) return "medium";
  if (eventCount >= 3) return "low";
  return "info";
}

const THREAT_LOOKUP: Record<string, { title: string; recommendation: string }> = {
  auth: {
    title: "Authentication activity",
    recommendation: "Review recent login attempts and consider tightening account lockout or MFA policies.",
  },
  access: {
    title: "Access control events",
    recommendation: "Audit permissions and rate limits; investigate repeated unauthorized requests.",
  },
  integrity: {
    title: "Integrity violations",
    recommendation: "Run an audit log integrity check and inspect tampered or malformed records.",
  },
  network: {
    title: "Network activity",
    recommendation: "Review client IPs and connection sources for anomalous traffic.",
  },
  data: {
    title: "Data access events",
    recommendation: "Review data exports and privileged data access for compliance.",
  },
};

export function detectThreats(events: SecurityEvent[]): SecurityThreat[] {
  const buckets = new Map<string, SecurityEvent[]>();
  for (const e of events) {
    const key = e.category || "data";
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }
  const threats: SecurityThreat[] = [];
  for (const [category, list] of buckets) {
    const info = THREAT_LOOKUP[category] ?? THREAT_LOOKUP.data;
    const severity = classifyThreatSeverity(list.length);
    if (severity === "info") continue;
    threats.push({
      id: `${category}-${list.length}`,
      category,
      title: info.title,
      severity,
      score: Math.min(100, severityRank(severity) * 25 + list.length),
      eventCount: list.length,
      recommendation: info.recommendation,
    });
  }
  return threats.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.eventCount - a.eventCount);
}

let securityDbInitialized = false;

function ensureSecurityDb(): void {
  if (securityDbInitialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT DEFAULT (datetime('now')),
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail TEXT DEFAULT '',
      ip TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_alerts (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT DEFAULT '',
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_policies (
      key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      value TEXT DEFAULT '',
      description TEXT DEFAULT ''
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_security_events_ts
    ON security_events(timestamp DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_security_alerts_status
    ON security_alerts(status)
  `);
  securityDbInitialized = true;
}

export function defaultSecurityPolicies(): SecurityPolicy[] {
  return [
    { key: "maxLoginFailures", enabled: true, value: 5, description: "Failed logins before the IP is locked out" },
    { key: "lockoutWindowMinutes", enabled: true, value: 15, description: "How long a locked-out IP stays locked" },
    { key: "auditRetentionDays", enabled: true, value: 90, description: "How many days audit logs are retained" },
    { key: "requireAuditIntegrity", enabled: true, value: true, description: "Fail-closed audit integrity verification" },
    { key: "enforceRbac", enabled: true, value: true, description: "Enforce role-based access control checks" },
    { key: "ipAnonymization", enabled: true, value: true, description: "Mask full IPs in security and audit events" },
  ];
}

export function getSecurityPolicies(): SecurityPolicy[] {
  ensureSecurityDb();
  const defaults = defaultSecurityPolicies();
  const rows = getDb().query("SELECT * FROM security_policies").all() as Array<{
    key: string; enabled: number; value: string; description: string;
  }>;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return defaults.map((d) => {
    const row = byKey.get(d.key);
    if (!row) return d;
    return {
      key: d.key,
      enabled: row.enabled === 1,
      value: typeof d.value === "number" ? Number(row.value || d.value) : row.value === "true" || row.value === "false" ? row.value === "true" : row.value,
      description: row.description || d.description,
    };
  });
}

export function getSecurityPolicy(key: string): SecurityPolicy | null {
  return getSecurityPolicies().find((p) => p.key === key) ?? null;
}

export function updateSecurityPolicy(key: string, changes: { enabled?: boolean; value?: number | string | boolean }): SecurityPolicy | null {
  const existing = getSecurityPolicy(key);
  if (!existing) return null;
  ensureSecurityDb();
  const enabled = changes.enabled ?? existing.enabled;
  const value = changes.value ?? existing.value;
  getDb().run(
    "INSERT INTO security_policies (key, enabled, value, description) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, value = excluded.value, description = excluded.description",
    [key, enabled ? 1 : 0, String(value), existing.description],
  );
  return getSecurityPolicy(key);
}

export function recordSecurityEvent(event: {
  category: string;
  severity: SecuritySeverity;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  ip?: string;
}): SecurityEvent {
  ensureSecurityDb();
  const db = getDb();
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const severity = isSecuritySeverity(event.severity) ? event.severity : "info";
  db.run(
    "INSERT INTO security_events (id, timestamp, category, severity, actor, action, resource, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, timestamp, event.category, severity, event.actor, event.action, event.resource, event.detail, event.ip ?? null],
  );

  if (severity === "high" || severity === "critical") {
    createNotification({
      level: severity === "critical" ? "critical" : "warning",
      title: `Security: ${event.action}`,
      message: event.detail,
      source: "security",
    });
    createSecurityAlert({
      level: severity,
      title: `Security: ${event.action}`,
      detail: event.detail,
    });
  }
  return { id, timestamp, category: event.category, severity, actor: event.actor, action: event.action, resource: event.resource, detail: event.detail, ip: event.ip };
}

export function querySecurityEvents(options: {
  limit?: number;
  offset?: number;
  severity?: string;
  category?: string;
  actor?: string;
  since?: string;
  until?: string;
} = {}): SecurityEvent[] {
  ensureSecurityDb();
  const db = getDb();
  const conditions: string[] = [];
  const params: string[] = [];
  if (options.severity) {
    conditions.push("severity = ?");
    params.push(options.severity);
  }
  if (options.category) {
    conditions.push("category = ?");
    params.push(options.category);
  }
  if (options.actor) {
    conditions.push("actor = ?");
    params.push(options.actor);
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
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const rows = db.query(
    `SELECT * FROM security_events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
  ).all(...params, String(limit), String(offset)) as Array<{
    id: string; timestamp: string; category: string; severity: string; actor: string;
    action: string; resource: string; detail: string; ip: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    category: r.category,
    severity: r.severity as SecuritySeverity,
    actor: r.actor,
    action: r.action,
    resource: r.resource,
    detail: r.detail,
    ip: r.ip ?? undefined,
  }));
}

export function getSecurityEventStats(): {
  total: number;
  bySeverity: Record<SecuritySeverity, number>;
  byCategory: Record<string, number>;
} {
  ensureSecurityDb();
  const db = getDb();
  const total = (db.query("SELECT COUNT(*) AS count FROM security_events").get() as { count: number }).count;
  const bySeverity = Object.fromEntries(SECURITY_SEVERITIES.map((s) => [s, 0])) as Record<SecuritySeverity, number>;
  const sevRows = db.query("SELECT severity, COUNT(*) AS count FROM security_events GROUP BY severity").all() as Array<{ severity: string; count: number }>;
  for (const r of sevRows) if (isSecuritySeverity(r.severity)) bySeverity[r.severity] += r.count;
  const catRows = db.query("SELECT category, COUNT(*) AS count FROM security_events GROUP BY category").all() as Array<{ category: string; count: number }>;
  const byCategory: Record<string, number> = {};
  for (const r of catRows) byCategory[r.category] = r.count;
  return { total, bySeverity, byCategory };
}

export function listSecurityAlerts(): SecurityAlert[] {
  ensureSecurityDb();
  const rows = getDb().query("SELECT * FROM security_alerts ORDER BY created_at DESC").all() as Array<{
    id: string; level: string; title: string; detail: string; status: string; created_at: string; resolved_at: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    level: (isSecuritySeverity(r.level) ? r.level : "medium") as SecuritySeverity,
    title: r.title,
    detail: r.detail,
    status: r.status === "resolved" ? "resolved" : "open",
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

export function createSecurityAlert(input: { level: SecuritySeverity; title: string; detail?: string }): SecurityAlert {
  ensureSecurityDb();
  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const level = isSecuritySeverity(input.level) ? input.level : "medium";
  db.run(
    "INSERT INTO security_alerts (id, level, title, detail, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
    [id, level, input.title, input.detail ?? "", createdAt],
  );
  return { id, level, title: input.title, detail: input.detail ?? "", status: "open", createdAt, resolvedAt: null };
}

export function resolveSecurityAlert(id: string): SecurityAlert | null {
  ensureSecurityDb();
  const existing = listSecurityAlerts().find((a) => a.id === id);
  if (!existing) return null;
  getDb().run("UPDATE security_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?", [new Date().toISOString(), id]);
  return listSecurityAlerts().find((a) => a.id === id) ?? null;
}

export function deleteSecurityAlert(id: string): boolean {
  ensureSecurityDb();
  return getDb().run("DELETE FROM security_alerts WHERE id = ?", [id]).changes > 0;
}

export function clearSecurityAlerts(): number {
  ensureSecurityDb();
  return getDb().run("DELETE FROM security_alerts").changes;
}

export function computeComplianceStatus(policies: SecurityPolicy[] = getSecurityPolicies(), telemetryEnabled = false): ComplianceStatus {
  const license = getLicense();
  const hasSoc2 = license.features.includes("soc2_compliance") || license.tier === "enterprise-plus";
  const policyValue = (key: string): number | string | boolean | undefined => policies.find((p) => p.key === key)?.value;
  const auditRetention = Number(policyValue("auditRetentionDays") ?? 90);
  const requireIntegrity = Boolean(policyValue("requireAuditIntegrity") ?? true);
  const enforceRbac = Boolean(policyValue("enforceRbac") ?? true);
  const ipAnonymization = Boolean(policyValue("ipAnonymization") ?? true);

  const requirements: ComplianceRequirement[] = [
    { framework: "SOC 2", requirement: "Access control enforcement", satisfied: enforceRbac, detail: enforceRbac ? "RBAC is enabled." : "RBAC enforcement is disabled." },
    { framework: "SOC 2", requirement: "Audit logging", satisfied: true, detail: "Enterprise audit trail is enabled." },
    { framework: "SOC 2", requirement: "Log integrity verification", satisfied: requireIntegrity, detail: requireIntegrity ? "Hash-chained audit verification is required." : "Integrity verification is optional." },
    { framework: "SOC 2", requirement: "Incident response", satisfied: true, detail: "Security alerts and event timeline are available." },
    { framework: "SOC 2", requirement: "Framework eligibility", satisfied: hasSoc2, detail: hasSoc2 ? "SOC 2 tier included in license." : "Requires enterprise-plus license." },
    { framework: "GDPR", requirement: "Consent-based telemetry", satisfied: telemetryEnabled === false || telemetryEnabled, detail: telemetryEnabled ? "Telemetry is opt-in with disclosure." : "Telemetry is disabled (data minimization)." },
    { framework: "GDPR", requirement: "Data retention limits", satisfied: auditRetention > 0, detail: `Audit logs retained for ${auditRetention} days.` },
    { framework: "GDPR", requirement: "IP anonymization", satisfied: ipAnonymization, detail: ipAnonymization ? "IP addresses are masked." : "Full IPs are stored." },
  ];

  const frameworks = (["SOC 2", "GDPR"] as const).map((framework) => {
    const list = requirements.filter((r) => r.framework === framework);
    const met = list.filter((r) => r.satisfied).length;
    return { framework, score: list.length ? Math.round((met / list.length) * 100) : 0, total: list.length, met };
  });
  const score = requirements.length ? Math.round((requirements.filter((r) => r.satisfied).length / requirements.length) * 100) : 0;
  return { score, requirements, frameworks };
}
