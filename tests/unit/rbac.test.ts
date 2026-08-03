import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  PERMISSION_CATALOG,
  ALL_PERMISSIONS,
  BUILTIN_ROLE_TEMPLATES,
  computeEffectivePermissions,
  isValidPermission,
  createRole,
  cloneRole,
  assignRoleToUser,
  removeRoleFromUser,
  getUserRoles,
  checkPermission,
  resolveEffectivePermissionsForUser,
  deleteRole,
} from "../../src/enterprise/rbac";
import type { RbacRole } from "../../src/enterprise/rbac";
import { getDb, closeDb } from "../../src/session/db";
import { prop, randInt, randStr } from "./prop";

function roleWith(overrides: Partial<RbacRole>): RbacRole {
  return {
    id: "r" + randInt(() => 0, 1),
    name: "role",
    description: "",
    permissions: [],
    deny: [],
    parentRoleId: null,
    builtin: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("RBAC consistency", () => {
  test("permission catalog has unique keys and covers every built-in role permission", () => {
    const keys = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of BUILTIN_ROLE_TEMPLATES) {
      for (const p of t.permissions) expect(keys).toContain(p);
    }
    expect(ALL_PERMISSIONS.length).toBe(keys.length);
  });

  test("admin template grants every permission in the catalog", () => {
    const admin = BUILTIN_ROLE_TEMPLATES.find((t) => t.name === "admin");
    expect(admin).toBeDefined();
    if (!admin) return;
    expect(new Set(admin.permissions).size).toBe(ALL_PERMISSIONS.length);
  });

  test("effective permissions are deterministic and idempotent", () => {
    prop(100, (rand) => {
      const role = roleWith({ permissions: [ALL_PERMISSIONS[randInt(rand, ALL_PERMISSIONS.length)]] });
      const resolveParent = () => null;
      const a = computeEffectivePermissions(role, resolveParent);
      const b = computeEffectivePermissions(role, resolveParent);
      expect([...a].sort()).toEqual([...b].sort());
    });
  });

  test("child roles inherit parent permissions transitively", () => {
    const base = roleWith({ id: "p", permissions: ["dashboard.view", "audit.read"], deny: [] });
    const child = roleWith({ id: "c", permissions: ["analytics.read"], deny: [], parentRoleId: "p" });
    const byId: Record<string, typeof base> = { p: base };
    const effective = computeEffectivePermissions(child, (id) => byId[id] ?? null);
    expect(effective.has("dashboard.view")).toBe(true);
    expect(effective.has("audit.read")).toBe(true);
    expect(effective.has("analytics.read")).toBe(true);
  });

  test("deny overrides inherited grants but never removes a role's own grants", () => {
    const base = roleWith({ id: "p", permissions: ["audit.read", "audit.export", "security.read"], deny: [] });
    const child = roleWith({
      id: "c", permissions: ["audit.read"], deny: ["audit.export", "security.read"], parentRoleId: "p",
    });
    const byId: Record<string, typeof base> = { p: base };
    const effective = computeEffectivePermissions(child, (id) => byId[id] ?? null);
    expect(effective.has("audit.read")).toBe(true);
    expect(effective.has("audit.export")).toBe(false);
    expect(effective.has("security.read")).toBe(false);
  });

  test("unknown permission strings are never valid", () => {
    prop(100, (rand) => {
      const s = randStr(rand, 1 + randInt(rand, 12), "abc.xyz012");
      expect(isValidPermission(s)).toBe(ALL_PERMISSIONS.includes(s));
    });
  });
});

describe("RBAC storage round-trip", () => {
  const created: string[] = [];

  beforeAll(() => {
    getDb();
  });

  afterAll(() => {
    const db = getDb();
    for (const id of created) db.run("DELETE FROM rbac_roles WHERE id = ?", [id]);
    closeDb();
  });

  test("creating, cloning, assigning, and checking a role works end-to-end", () => {
    const name = `test-role-${Date.now()}-${randInt(() => 0, 1000)}`;
    const createdRole = createRole({ name, permissions: ["dashboard.view", "audit.read"], deny: ["audit.export"] });
    expect(createdRole.ok).toBe(true);
    if (!createdRole.ok) return;
    created.push(createdRole.role.id);

    expect(createRole({ name }).ok).toBe(false);
    expect(createRole({ name: `role-${Date.now()}`, permissions: ["not.a.perm"] as never }).ok).toBe(false);

    const cloned = cloneRole(createdRole.role.id, `${name}-clone`);
    expect(cloned.ok).toBe(true);
    if (!cloned.ok) return;
    created.push(cloned.role.id);
    expect([...cloned.role.permissions].sort()).toEqual([...createdRole.role.permissions].sort());
    expect([...cloned.role.deny].sort()).toEqual([...createdRole.role.deny].sort());

    const userId = `user-${Date.now()}`;
    const assigned = assignRoleToUser(userId, createdRole.role.id);
    expect(assigned.ok).toBe(true);
    expect(getUserRoles(userId).some((r) => r.id === createdRole.role.id)).toBe(true);
    expect(checkPermission(userId, "dashboard.view")).toBe(true);
    expect(checkPermission(userId, "audit.read")).toBe(true);
    expect(checkPermission(userId, "audit.export")).toBe(false);
    expect(checkPermission(userId, "config.manage")).toBe(false);

    expect(removeRoleFromUser(userId, createdRole.role.id)).toBe(true);
    expect(checkPermission(userId, "dashboard.view")).toBe(false);

    const del = deleteRole(cloned.role.id);
    expect(del.ok).toBe(true);
    expect(deleteRole(cloned.role.id).ok).toBe(false);
  });

  test("permission resolution is monotonic under role addition", () => {
    const name = `mono-${Date.now()}`;
    const r1 = createRole({ name, permissions: ["analytics.read"] });
    const r2 = createRole({ name: `${name}-2`, permissions: ["sessions.read"] });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    created.push(r1.role.id, r2.role.id);
    const userId = `mono-user-${Date.now()}`;
    assignRoleToUser(userId, r1.role.id);
    expect(checkPermission(userId, "analytics.read")).toBe(true);
    expect(checkPermission(userId, "sessions.read")).toBe(false);
    assignRoleToUser(userId, r2.role.id);
    const effective = resolveEffectivePermissionsForUser(userId);
    expect(effective.has("analytics.read")).toBe(true);
    expect(effective.has("sessions.read")).toBe(true);
  });
});
