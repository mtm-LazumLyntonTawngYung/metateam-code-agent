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
      status TEXT DEFAULT 'active' CHECK(status IN ('active','deactivated')),
      joined_at TEXT DEFAULT (datetime('now')),
      last_active_at TEXT,
      PRIMARY KEY (user_id, org_id)
    )
  `);
  const cols = db.query("PRAGMA table_info(org_members)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "last_active_at")) {
    db.exec("ALTER TABLE org_members ADD COLUMN last_active_at TEXT");
  }
  if (!cols.some((c) => c.name === "status")) {
    db.exec("ALTER TABLE org_members ADD COLUMN status TEXT DEFAULT 'active'");
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
    "SELECT user_id, email, role, status, joined_at, last_active_at FROM org_members WHERE org_id = ? ORDER BY joined_at",
  ).all(orgId) as Array<{ user_id: string; email: string; role: string; status: string; joined_at: string; last_active_at: string | null }>;

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
      status: m.status as "active" | "deactivated",
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

export function findOrgMember(userId: string): { orgId: string; email: string; role: "admin" | "member" | "viewer"; status: "active" | "deactivated" } | null {
  ensureOrgDb();
  const db = getDb();
  const row = db.query(
    "SELECT org_id, email, role, status FROM org_members WHERE user_id = ? LIMIT 1",
  ).get(userId) as { org_id: string; email: string; role: string; status: string } | null;
  if (!row) return null;
  return {
    orgId: row.org_id,
    email: row.email,
    role: row.role as "admin" | "member" | "viewer",
    status: (row.status as "active" | "deactivated") ?? "active",
  };
}

export function updateOrgMember(
  userId: string,
  changes: { role?: "admin" | "member" | "viewer"; status?: "active" | "deactivated" },
): boolean {
  ensureOrgDb();
  const db = getDb();
  const sets: string[] = [];
  const params: string[] = [];
  if (changes.role !== undefined) {
    sets.push("role = ?");
    params.push(changes.role);
  }
  if (changes.status !== undefined) {
    sets.push("status = ?");
    params.push(changes.status);
  }
  if (sets.length === 0) return false;
  params.push(userId);
  const result = db.run(`UPDATE org_members SET ${sets.join(", ")} WHERE user_id = ?`, params);
  return result.changes > 0;
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

export function isValidSlug(slug: string): boolean {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 64;
}

export function slugExists(slug: string, excludeOrgId?: string): boolean {
  ensureOrgDb();
  const db = getDb();
  if (excludeOrgId) {
    return !!db.query("SELECT 1 AS ok FROM organizations WHERE slug = ? AND id != ?").get(slug, excludeOrgId);
  }
  return !!db.query("SELECT 1 AS ok FROM organizations WHERE slug = ?").get(slug);
}

export function updateOrganization(
  orgId: string,
  changes: { name?: string; slug?: string; tier?: Tier },
): Organization | null {
  ensureOrgDb();
  const db = getDb();
  const org = getOrganization(orgId);
  if (!org) return null;

  const sets: string[] = [];
  const params: string[] = [];
  if (changes.name !== undefined && changes.name.trim() !== "") {
    sets.push("name = ?");
    params.push(changes.name.trim());
  }
  if (changes.slug !== undefined && changes.slug.trim() !== "") {
    const slug = changes.slug.trim().toLowerCase();
    if (!isValidSlug(slug)) throw new Error("Slug must be lowercase alphanumeric with hyphens (e.g. acme-corp)");
    if (slugExists(slug, orgId)) throw new Error("Organization slug already in use");
    sets.push("slug = ?");
    params.push(slug);
  }
  if (changes.tier !== undefined) {
    if (!["community", "enterprise", "enterprise-plus"].includes(changes.tier)) {
      throw new Error("Tier must be one of: community, enterprise, enterprise-plus");
    }
    sets.push("tier = ?");
    params.push(changes.tier);
  }
  if (sets.length === 0) return org;

  params.push(orgId);
  db.run(`UPDATE organizations SET ${sets.join(", ")} WHERE id = ?`, params);
  return getOrganization(orgId);
}

export function deleteOrganization(orgId: string): boolean {
  ensureOrgDb();
  const db = getDb();
  const result = db.run("DELETE FROM organizations WHERE id = ?", [orgId]);
  return result.changes > 0;
}
