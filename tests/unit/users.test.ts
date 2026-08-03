import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createUser, updateUser, deactivateUser, getAllUsers, isValidEmail } from "../../src/enterprise/user";
import { createOrganization } from "../../src/enterprise/org";
import { getDb, closeDb } from "../../src/session/db";
import { prop, randInt, randStr } from "./prop";

describe("Property 13: User Management Consistency", () => {
  let orgId = "";
  const createdOrgs: string[] = [];

  beforeAll(() => {
    getDb();
    const org = createOrganization(`Prop Users ${Date.now()}`, `prop-users-${Date.now()}`);
    orgId = org.id;
    createdOrgs.push(org.id);
  });

  afterAll(() => {
    const db = getDb();
    for (const id of createdOrgs) {
      db.run("DELETE FROM organizations WHERE id = ?", [id]);
    }
    closeDb();
  });

  test("isValidEmail matches structural invariants for any input", () => {
    prop(200, (rand) => {
      const chars = "abc .@!#$%^&*()_123";
      const local = randStr(rand, 1 + randInt(rand, 20), chars);
      const domain = randStr(rand, 1 + randInt(rand, 20), chars);
      const email = `${local}@${domain}`;
      if (isValidEmail(email)) {
        expect(email).toContain("@");
        expect(email).not.toContain(" ");
        const [l, d] = email.split("@");
        expect(l.length).toBeGreaterThan(0);
        expect(d.includes(".")).toBe(true);
      }
    });
  });

  test("obviously invalid emails are always rejected", () => {
    prop(200, (rand) => {
      const bad = randStr(rand, 1 + randInt(rand, 15), "abc");
      expect(isValidEmail(`no-at-sign-${bad}`)).toBe(false);
      expect(isValidEmail(`${bad} @domain.com`)).toBe(false);
      expect(isValidEmail("user@nodot")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });
  });

  test("creating a user with any valid email and role yields a consistent record", () => {
    const roles = ["admin", "member", "viewer"];
    prop(100, (rand) => {
      const email = `${randStr(rand, 8, "abc123")}@prop.example`;
      const role = roles[randInt(rand, roles.length)];
      const result = createUser({ email, role, orgId });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.user.email).toBe(email);
      expect(result.user.role).toBe(role);
      expect(result.user.status).toBe("active");
      expect(result.user.orgId).toBe(orgId);
      expect(result.user.joinedAt).toBeTruthy();
    });
  });

  test("duplicate emails are always rejected and never grow the roster", () => {
    prop(50, (rand) => {
      const email = `${randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz0123456789")}@dup.example`;
      const first = createUser({ email, orgId });
      expect(first.ok).toBe(true);
      const before = getAllUsers().length;
      const second = createUser({ email, orgId });
      expect(second.ok).toBe(false);
      expect(second.ok === false && typeof second.error === "string").toBe(true);
      expect(getAllUsers().length).toBe(before);
    });
  });

  test("role changes are consistent for any role transition", () => {
    const roles = ["admin", "member", "viewer"];
    prop(100, (rand) => {
      const email = `${randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz0123456789")}@role.example`;
      const created = createUser({ email, role: "member", orgId });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const target = roles[randInt(rand, roles.length)];
      const updated = updateUser(created.user.userId, { role: target });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.user.role).toBe(target);
      expect(updated.user.email).toBe(email);
      expect(updated.user.status).toBe("active");
    });
  });

  test("invalid roles are always rejected", () => {
    prop(100, (rand) => {
      const email = `${randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz0123456789")}@badrole.example`;
      const created = createUser({ email, role: "member", orgId });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const bad = randStr(rand, 6, "abc") === "owner" ? "superadmin" : "owner";
      const updated = updateUser(created.user.userId, { role: bad });
      expect(updated.ok).toBe(false);
      const still = getAllUsers().find((u) => u.userId === created.user.userId);
      expect(still?.role).toBe("member");
    });
  });

  test("deactivation is idempotent and reversible, preserving the record", () => {
    prop(50, (rand) => {
      const email = `${randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz0123456789")}@deact.example`;
      const created = createUser({ email, orgId });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const id = created.user.userId;

      const d1 = deactivateUser(id);
      expect(d1.ok).toBe(true);
      if (!d1.ok) return;
      expect(d1.user.status).toBe("deactivated");

      const d2 = deactivateUser(id);
      expect(d2.ok).toBe(true);
      if (d2.ok) expect(d2.user.status).toBe("deactivated");

      const stillThere = getAllUsers().find((u) => u.userId === id);
      expect(stillThere).toBeDefined();
      expect(stillThere?.status).toBe("deactivated");

      const r = updateUser(id, { status: "active" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.user.status).toBe("active");
    });
  });

  test("seat limits are enforced once the cap is reached", () => {
    const org = createOrganization(`Seat Test ${Date.now()}`, `seat-${Date.now()}`);
    createdOrgs.push(org.id);
    const first = createUser({ email: "seat-one@seat.example", role: "member", orgId: org.id, tier: "enterprise" });
    expect(first.ok).toBe(true);
    const second = createUser({ email: "seat-two@seat.example", role: "member", orgId: org.id, tier: "enterprise" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/seat/i);
  });
});
