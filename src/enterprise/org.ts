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
import type { Organization, OrgMember, OrgSettings, Tier } from "./types";

let orgDbInitialized = false;

function ensureOrgDb(): void {
  if (orgDbInitialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      tier TEXT DEFAULT 'community',
      created_at TEXT DEFAULT (datetime('now')),
      settings TEXT DEFAULT '{}'
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_members (
      user_id TEXT NOT NULL,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK(role IN ('admin','member','viewer')),
      joined_at TEXT DEFAULT (datetime('now')),
      last_active_at TEXT,
      PRIMARY KEY (user_id, org_id)
    )
  `);
  const cols = db.query("PRAGMA table_info(org_members)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "last_active_at")) {
    db.exec("ALTER TABLE org_members ADD COLUMN last_active_at TEXT");
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_org_members_org
    ON org_members(org_id)
  `);
  orgDbInitialized = true;
}

function defaultSettings(): OrgSettings {
  return {
    ssoEnabled: false,
    auditLogRetentionDays: 90,
    maxConcurrentSessions: 10,
    allowedDomains: [],
    enforceMfa: false,
  };
}

export function createOrganization(name: string, slug: string, tier: Tier = "community"): Organization {
  ensureOrgDb();
  const db = getDb();
  const id = randomUUID();
  const settings = defaultSettings();

  db.run(
    "INSERT INTO organizations (id, name, slug, tier, created_at, settings) VALUES (?, ?, ?, ?, datetime('now'), ?)",
    [id, name, slug, tier, JSON.stringify(settings)],
  );

  return { id, name, slug, tier, createdAt: new Date().toISOString(), members: [], settings };
}

export function getOrganization(orgId: string): Organization | null {
  ensureOrgDb();
  const db = getDb();
  const row = db.query("SELECT * FROM organizations WHERE id = ?").get(orgId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const members = db.query(
    "SELECT user_id, email, role, joined_at, last_active_at FROM org_members WHERE org_id = ? ORDER BY joined_at",
  ).all(orgId) as Array<{ user_id: string; email: string; role: string; joined_at: string; last_active_at: string | null }>;

  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    tier: row.tier as Tier,
    createdAt: row.created_at as string,
    members: members.map((m) => ({
      userId: m.user_id,
      email: m.email,
      role: m.role as "admin" | "member" | "viewer",
      joinedAt: m.joined_at,
      lastActiveAt: m.last_active_at ?? undefined,
    })),
    settings: row.settings ? { ...defaultSettings(), ...JSON.parse(row.settings as string) as Partial<OrgSettings> } : defaultSettings(),
  };
}

export function listOrganizations(): Organization[] {
  ensureOrgDb();
  const db = getDb();
  const rows = db.query("SELECT id FROM organizations ORDER BY created_at DESC").all() as Array<{ id: string }>;
  return rows.map((r) => getOrganization(r.id)).filter(Boolean) as Organization[];
}

export function updateOrgSettings(orgId: string, settings: Partial<OrgSettings>): Organization | null {
  ensureOrgDb();
  const db = getDb();
  const org = getOrganization(orgId);
  if (!org) return null;

  const merged = { ...org.settings, ...settings };
  db.run("UPDATE organizations SET settings = ? WHERE id = ?", [JSON.stringify(merged), orgId]);
  return getOrganization(orgId);
}

export function addOrgMember(orgId: string, userId: string, email: string, role: "admin" | "member" | "viewer" = "member"): boolean {
  ensureOrgDb();
  const db = getDb();
  try {
    db.run(
      "INSERT OR IGNORE INTO org_members (user_id, org_id, email, role, joined_at) VALUES (?, ?, ?, ?, datetime('now'))",
      [userId, orgId, email, role],
    );
    return true;
  } catch {
    return false;
  }
}

export function touchOrgMember(orgId: string, userId: string): void {
  ensureOrgDb();
  const db = getDb();
  db.run(
    "UPDATE org_members SET last_active_at = datetime('now') WHERE org_id = ? AND user_id = ?",
    [orgId, userId],
  );
}

export function removeOrgMember(orgId: string, userId: string): boolean {
  ensureOrgDb();
  const db = getDb();
  const result = db.run("DELETE FROM org_members WHERE org_id = ? AND user_id = ?", [orgId, userId]);
  return result.changes > 0;
}

export function updateOrgTier(orgId: string, tier: Tier): boolean {
  ensureOrgDb();
  const db = getDb();
  const result = db.run("UPDATE organizations SET tier = ? WHERE id = ?", [tier, orgId]);
  return result.changes > 0;
}
