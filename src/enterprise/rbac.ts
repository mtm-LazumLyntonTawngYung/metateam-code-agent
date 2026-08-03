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

export type PermissionGroup = {
  key: string;
  label: string;
  permissions: Array<{ key: string; label: string; description: string }>;
};

export type RbacRole = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  deny: string[];
  parentRoleId: string | null;
  builtin: boolean;
  createdAt: string;
};

export type RbacUserRole = {
  userId: string;
  roleId: string;
  createdAt: string;
};

export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    permissions: [
      { key: "dashboard.view", label: "View dashboard", description: "View the control plane overview." },
    ],
  },
  {
    key: "audit",
    label: "Audit",
    permissions: [
      { key: "audit.read", label: "Read audit logs", description: "Inspect audit events and integrity." },
      { key: "audit.export", label: "Export audit logs", description: "Download audit trails." },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    permissions: [
      { key: "analytics.read", label: "Read analytics", description: "View usage and cost analytics." },
      { key: "analytics.export", label: "Export analytics", description: "Download analytics reports." },
    ],
  },
  {
    key: "security",
    label: "Security",
    permissions: [
      { key: "security.read", label: "Read security", description: "View security events, threats and alerts." },
      { key: "security.manage", label: "Manage security", description: "Resolve alerts and configure policies." },
    ],
  },
  {
    key: "users",
    label: "Users",
    permissions: [
      { key: "users.read", label: "Read users", description: "List users and roles." },
      { key: "users.manage", label: "Manage users", description: "Create, update and deactivate users." },
    ],
  },
  {
    key: "orgs",
    label: "Organizations",
    permissions: [
      { key: "orgs.read", label: "Read organizations", description: "List organizations and settings." },
      { key: "orgs.manage", label: "Manage organizations", description: "Create and update organizations." },
    ],
  },
  {
    key: "license",
    label: "License",
    permissions: [
      { key: "license.manage", label: "Manage license", description: "Activate, validate and deactivate licenses." },
    ],
  },
  {
    key: "config",
    label: "Configuration",
    permissions: [
      { key: "config.read", label: "Read configuration", description: "View masked configuration." },
      { key: "config.manage", label: "Manage configuration", description: "Update runtime configuration." },
    ],
  },
  {
    key: "rbac",
    label: "Access Control",
    permissions: [
      { key: "rbac.manage", label: "Manage RBAC", description: "Create roles and assign users to roles." },
    ],
  },
  {
    key: "exports",
    label: "Exports",
    permissions: [
      { key: "exports.manage", label: "Manage exports", description: "Run exports and manage templates." },
    ],
  },
  {
    key: "notifications",
    label: "Notifications",
    permissions: [
      { key: "notifications.manage", label: "Manage notifications", description: "Create and clear notifications." },
    ],
  },
  {
    key: "sessions",
    label: "Sessions",
    permissions: [
      { key: "sessions.read", label: "Read sessions", description: "View active agent sessions." },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.key));

export const BUILTIN_ROLE_TEMPLATES: Array<{
  name: string;
  description: string;
  permissions: string[];
  deny: string[];
  parentRoleId: string | null;
}> = [
  {
    name: "admin",
    description: "Full access to every dashboard capability.",
    permissions: ALL_PERMISSIONS,
    deny: [],
    parentRoleId: null,
  },
  {
    name: "operator",
    description: "Day-to-day management of users, orgs, config and exports.",
    permissions: [
      "dashboard.view", "audit.read", "analytics.read", "security.read",
      "users.read", "users.manage", "orgs.read", "orgs.manage",
      "config.read", "config.manage", "exports.manage", "notifications.manage",
      "sessions.read", "license.manage",
    ],
    deny: ["security.manage", "rbac.manage", "audit.export"],
    parentRoleId: null,
  },
  {
    name: "auditor",
    description: "Read-only access focused on audit, security and compliance.",
    permissions: ["dashboard.view", "audit.read", "audit.export", "security.read", "analytics.read"],
    deny: [],
    parentRoleId: null,
  },
  {
    name: "member",
    description: "Standard read access to operational data.",
    permissions: ["dashboard.view", "analytics.read", "sessions.read"],
    deny: [],
    parentRoleId: null,
  },
  {
    name: "viewer",
    description: "Read-only overview access.",
    permissions: ["dashboard.view"],
    deny: [],
    parentRoleId: null,
  },
];

export function findPermission(permission: string): { key: string; label: string; description: string } | null {
  for (const group of PERMISSION_CATALOG) {
    const found = group.permissions.find((p) => p.key === permission);
    if (found) return found;
  }
  return null;
}

export function isValidPermission(permission: unknown): permission is string {
  return typeof permission === "string" && !!findPermission(permission);
}

export function computeEffectivePermissions(
  role: Pick<RbacRole, "permissions" | "deny" | "parentRoleId">,
  resolveParent: (id: string) => Pick<RbacRole, "permissions" | "deny" | "parentRoleId"> | null,
  visited: Set<string> = new Set(),
): Set<string> {
  const effective = new Set<string>();
  if (role.parentRoleId && !visited.has(role.parentRoleId)) {
    visited.add(role.parentRoleId);
    const parent = resolveParent(role.parentRoleId);
    if (parent) {
      const parentEffective = computeEffectivePermissions(parent, resolveParent, visited);
      for (const p of parentEffective) effective.add(p);
    }
  }
  for (const d of role.deny) effective.delete(d);
  for (const p of role.permissions) effective.add(p);
  return effective;
}

let rbacDbInitialized = false;

function ensureRbacDb(): void {
  if (rbacDbInitialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS rbac_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      permissions TEXT DEFAULT '[]',
      deny TEXT DEFAULT '[]',
      parent_role_id TEXT,
      builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rbac_user_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, role_id)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_role
    ON rbac_user_roles(role_id)
  `);
  rbacDbInitialized = true;
}

function parseJsonList(value: string | null, fallback: string[] = []): string[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : fallback;
  } catch {
    return fallback;
  }
}

export function listRoles(): RbacRole[] {
  ensureRbacDb();
  const rows = getDb().query("SELECT * FROM rbac_roles ORDER BY builtin DESC, created_at ASC").all() as Array<{
    id: string; name: string; description: string; permissions: string; deny: string;
    parent_role_id: string | null; builtin: number; created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: parseJsonList(r.permissions),
    deny: parseJsonList(r.deny),
    parentRoleId: r.parent_role_id,
    builtin: r.builtin === 1,
    createdAt: r.created_at,
  }));
}

export function getRole(roleId: string): RbacRole | null {
  return listRoles().find((r) => r.id === roleId) ?? null;
}

export function getRoleByName(name: string): RbacRole | null {
  return listRoles().find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export function ensureBuiltinRoles(): void {
  ensureRbacDb();
  const db = getDb();
  for (const template of BUILTIN_ROLE_TEMPLATES) {
    const existing = getRoleByName(template.name);
    if (existing) continue;
    db.run(
      "INSERT INTO rbac_roles (id, name, description, permissions, deny, parent_role_id, builtin) VALUES (?, ?, ?, ?, ?, ?, 1)",
      [randomUUID(), template.name, template.description, JSON.stringify(template.permissions), JSON.stringify(template.deny), template.parentRoleId],
    );
  }
}

export type RbacResult =
  | { ok: true; role: RbacRole }
  | { ok: false; error: string };

export function createRole(input: {
  name: string;
  description?: string;
  permissions?: string[];
  deny?: string[];
  parentRoleId?: string | null;
}): RbacResult {
  ensureBuiltinRoles();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Role name is required" };
  if (getRoleByName(name)) return { ok: false, error: `A role named "${name}" already exists` };

  const permissions = (input.permissions ?? []).filter(isValidPermission);
  const deny = (input.deny ?? []).filter(isValidPermission);
  const invalid = (input.permissions ?? []).filter((p) => !isValidPermission(p));
  if (invalid.length > 0) {
    return { ok: false, error: `Unknown permissions: ${invalid.join(", ")}` };
  }
  let parentRoleId = input.parentRoleId ?? null;
  if (parentRoleId && !getRole(parentRoleId)) {
    return { ok: false, error: "Parent role not found" };
  }
  if (parentRoleId) {
    const self = getRole(parentRoleId);
    if (self && (self.parentRoleId === parentRoleId || self.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: "Role cannot be its own parent" };
    }
  }

  ensureRbacDb();
  const id = randomUUID();
  getDb().run(
    "INSERT INTO rbac_roles (id, name, description, permissions, deny, parent_role_id, builtin) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [id, name, input.description ?? "", JSON.stringify(permissions), JSON.stringify(deny), parentRoleId],
  );
  const role = getRole(id);
  return role ? { ok: true, role } : { ok: false, error: "Failed to create role" };
}

export function updateRole(
  roleId: string,
  changes: { name?: string; description?: string; permissions?: string[]; deny?: string[]; parentRoleId?: string | null },
): RbacResult {
  const existing = getRole(roleId);
  if (!existing) return { ok: false, error: "Role not found" };
  if (existing.builtin) {
    if (changes.name !== undefined && changes.name !== existing.name) {
      return { ok: false, error: "Built-in role names cannot be changed" };
    }
    if (changes.permissions !== undefined && changes.permissions.join(",") !== existing.permissions.join(",")) {
      return { ok: false, error: "Built-in role permissions cannot be changed" };
    }
  }

  const name = changes.name?.trim() ?? existing.name;
  if (!name) return { ok: false, error: "Role name is required" };
  const dup = getRoleByName(name);
  if (dup && dup.id !== roleId) return { ok: false, error: `A role named "${name}" already exists` };

  const permissions = changes.permissions !== undefined ? changes.permissions.filter(isValidPermission) : existing.permissions;
  const deny = changes.deny !== undefined ? changes.deny.filter(isValidPermission) : existing.deny;
  const parentRoleId = changes.parentRoleId !== undefined ? changes.parentRoleId : existing.parentRoleId;
  if (parentRoleId && !getRole(parentRoleId)) return { ok: false, error: "Parent role not found" };
  if (parentRoleId === roleId) return { ok: false, error: "Role cannot be its own parent" };

  getDb().run(
    "UPDATE rbac_roles SET name = ?, description = ?, permissions = ?, deny = ?, parent_role_id = ? WHERE id = ?",
    [name, changes.description ?? existing.description, JSON.stringify(permissions), JSON.stringify(deny), parentRoleId, roleId],
  );
  const role = getRole(roleId);
  return role ? { ok: true, role } : { ok: false, error: "Failed to update role" };
}

export function deleteRole(roleId: string): RbacResult {
  const existing = getRole(roleId);
  if (!existing) return { ok: false, error: "Role not found" };
  if (existing.builtin) return { ok: false, error: "Built-in roles cannot be deleted" };
  getDb().run("DELETE FROM rbac_roles WHERE id = ?", [roleId]);
  getDb().run("DELETE FROM rbac_user_roles WHERE role_id = ?", [roleId]);
  return { ok: true, role: existing };
}

export function cloneRole(roleId: string, newName: string): RbacResult {
  const existing = getRole(roleId);
  if (!existing) return { ok: false, error: "Role not found" };
  return createRole({
    name: newName,
    description: `${existing.description} (clone of ${existing.name})`,
    permissions: [...existing.permissions],
    deny: [...existing.deny],
    parentRoleId: existing.parentRoleId,
  });
}

export function assignRoleToUser(userId: string, roleId: string): RbacResult {
  ensureBuiltinRoles();
  const role = getRole(roleId);
  if (!role) return { ok: false, error: "Role not found" };
  if (!userId) return { ok: false, error: "userId is required" };
  ensureRbacDb();
  getDb().run(
    "INSERT INTO rbac_user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT(user_id, role_id) DO NOTHING",
    [userId, roleId],
  );
  return { ok: true, role };
}

export function removeRoleFromUser(userId: string, roleId: string): boolean {
  ensureRbacDb();
  return getDb().run("DELETE FROM rbac_user_roles WHERE user_id = ? AND role_id = ?", [userId, roleId]).changes > 0;
}

export function getUserRoles(userId: string): RbacRole[] {
  ensureBuiltinRoles();
  ensureRbacDb();
  const rows = getDb().query("SELECT role_id FROM rbac_user_roles WHERE user_id = ?").all(userId) as Array<{ role_id: string }>;
  return rows.map((r) => getRole(r.role_id)).filter((r): r is RbacRole => r !== null);
}

export function getUsersForRole(roleId: string): Array<{ userId: string; createdAt: string }> {
  ensureRbacDb();
  const rows = getDb().query(
    "SELECT user_id, created_at FROM rbac_user_roles WHERE role_id = ? ORDER BY created_at ASC",
  ).all(roleId) as Array<{ user_id: string; created_at: string }>;
  return rows.map((r) => ({ userId: r.user_id, createdAt: r.created_at }));
}

export function listRoleAssignments(): Array<{ userId: string; roleId: string; createdAt: string }> {
  ensureRbacDb();
  const rows = getDb().query("SELECT user_id, role_id, created_at FROM rbac_user_roles ORDER BY created_at ASC").all() as Array<{
    user_id: string; role_id: string; created_at: string;
  }>;
  return rows.map((r) => ({ userId: r.user_id, roleId: r.role_id, createdAt: r.created_at }));
}

export function resolveEffectivePermissionsForUser(userId: string): Set<string> {
  ensureBuiltinRoles();
  const roles = getUserRoles(userId);
  if (roles.length === 0) return new Set<string>();
  const byId = new Map(listRoles().map((r) => [r.id, r]));
  const effective = new Set<string>();
  const visited = new Set<string>();
  for (const role of roles) {
    const perms = computeEffectivePermissions(role, (id) => byId.get(id) ?? null, visited);
    for (const p of perms) effective.add(p);
  }
  return effective;
}

export function checkPermission(userId: string, permission: string): boolean {
  return resolveEffectivePermissionsForUser(userId).has(permission);
}

export function getRbacAnalytics(): {
  roleCount: number;
  customRoleCount: number;
  assignmentCount: number;
  permissionsCovered: number;
  totalPermissions: number;
  byRole: Array<{ roleId: string; name: string; users: number; permissions: number }>;
} {
  ensureBuiltinRoles();
  const roles = listRoles();
  const totalPermissions = ALL_PERMISSIONS.length;
  const covered = new Set<string>();
  for (const role of roles) for (const p of role.permissions) covered.add(p);
  return {
    roleCount: roles.length,
    customRoleCount: roles.filter((r) => !r.builtin).length,
    assignmentCount: (getDb().query("SELECT COUNT(*) AS count FROM rbac_user_roles").get() as { count: number }).count,
    permissionsCovered: covered.size,
    totalPermissions,
    byRole: roles.map((r) => ({ roleId: r.id, name: r.name, users: getUsersForRole(r.id).length, permissions: r.permissions.length })),
  };
}
