/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { randomUUID } from "crypto";
import { addOrgMember, createOrganization, getOrganization, listOrganizations, touchOrgMember, updateOrgMember } from "./org";
import { getDb } from "../session/db";
import { getLicense } from "./license";
import { loadConfig } from "../config";
import type { Tier } from "./types";

type ProvisionedUser = {
  userId: string;
  orgId: string;
  isNew: boolean;
};

function resolveOrgName(email: string): string {
  const configName = loadConfig().organization?.name?.trim();
  if (configName) return configName;

  const licenseName = getLicense().organization.trim();
  if (licenseName && licenseName.toLowerCase() !== "community") return licenseName;

  const derived = deriveOrgNameFromDomain(email);
  if (derived) return derived;

  throw new Error(
    "No organization name configured. Set `organization.name` in the config or run `mtc enterprise org create` first.",
  );
}

function deriveOrgNameFromDomain(email: string): string | null {
  const domain = email.split("@")[1]?.trim();
  if (!domain) return null;
  const labels = domain.split(".");
  const sld = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  if (!sld) return null;
  return sld
    .replace(/[^a-zA-Z0-9]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ensureUserProvisioned(email: string): ProvisionedUser {
  let org = listOrganizations()[0];

  if (!org) {
    const name = resolveOrgName(email);
    console.warn(`[mtc auth] No organization name configured — using "${name}"`);
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
    org = createOrganization(name, slug);
  }

  const existing = org.members.find((m) => m.email.toLowerCase() === email.toLowerCase());
  const userId = existing?.userId ?? randomUUID();

  if (!existing) {
    addOrgMember(org.id, userId, email, "member");
  }

  touchOrgMember(org.id, userId);

  return { userId, orgId: org.id, isNew: !existing };
}

export function getAllUsers(): Array<{
  userId: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string;
  lastActiveAt: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgTier: string;
}> {
  return listOrganizations().flatMap((org) =>
    org.members.map((m) => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt ?? "",
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      orgTier: org.tier,
    })),
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "member", "viewer"] as const;
type Role = (typeof ROLES)[number];

export function isValidEmail(email: string): boolean {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

export type UserManagementResult =
  | { ok: true; user: ReturnType<typeof getAllUsers>[number] }
  | { ok: false; error: string };

function findUser(userId: string): ReturnType<typeof getAllUsers>[number] | null {
  return getAllUsers().find((u) => u.userId === userId) ?? null;
}

function activeMemberCount(orgId: string): number {
  const org = getOrganization(orgId);
  if (!org) return 0;
  return org.members.filter((m) => m.status !== "deactivated").length;
}

export function createUser(options: {
  email: string;
  role?: string;
  orgId?: string;
  tier?: Tier;
}): UserManagementResult {
  const email = (options.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, error: "A valid email address is required" };
  }

  const orgId = options.orgId ?? listOrganizations()[0]?.id ?? "";
  if (!orgId) {
    return { ok: false, error: "No organization exists. Create an organization first" };
  }
  const org = getOrganization(orgId);
  if (!org) {
    return { ok: false, error: "Organization not found" };
  }

  const dup = org.members.find((m) => m.email.toLowerCase() === email);
  if (dup) {
    return { ok: false, error: "A user with this email already exists in the organization" };
  }

  const role = (options.role ?? "member").toLowerCase() as Role;
  if (!ROLES.includes(role)) {
    return { ok: false, error: "Role must be one of: admin, member, viewer" };
  }

  const license = getLicense();
  const tier = options.tier ?? org.tier ?? license.tier;
  if (tier !== "community" && activeMemberCount(orgId) >= license.maxSeats) {
    return { ok: false, error: `Seat limit reached (${license.maxSeats}). Upgrade your license to add more users` };
  }

  const userId = randomUUID();
  addOrgMember(orgId, userId, email, role);
  const user = findUser(userId);
  return user ? { ok: true, user } : { ok: false, error: "Failed to create user" };
}

export function updateUser(userId: string, changes: { email?: string; role?: string; status?: string }): UserManagementResult {
  const user = findUser(userId);
  if (!user) {
    return { ok: false, error: "User not found" };
  }

  if (changes.email !== undefined) {
    const email = changes.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      return { ok: false, error: "A valid email address is required" };
    }
    const org = getOrganization(user.orgId);
    const dup = org?.members.find((m) => m.userId !== userId && m.email.toLowerCase() === email);
    if (dup) {
      return { ok: false, error: "Another user in the organization already uses this email" };
    }
    getDb().run("UPDATE org_members SET email = ? WHERE user_id = ?", [email, userId]);
  }

  if (changes.role !== undefined) {
    const role = changes.role.toLowerCase() as Role;
    if (!ROLES.includes(role)) {
      return { ok: false, error: "Role must be one of: admin, member, viewer" };
    }
    updateOrgMember(userId, { role });
  }

  if (changes.status !== undefined) {
    const status = changes.status.toLowerCase();
    if (status !== "active" && status !== "deactivated") {
      return { ok: false, error: "Status must be one of: active, deactivated" };
    }
    updateOrgMember(userId, { status });
  }

  const updated = findUser(userId);
  return updated ? { ok: true, user: updated } : { ok: false, error: "Failed to update user" };
}

export function deactivateUser(userId: string): UserManagementResult {
  return updateUser(userId, { status: "deactivated" });
}

export function countActiveUsers(): number {
  return getAllUsers().filter((u) => u.status !== "deactivated").length;
}

export function listDeactivatedUsers(): ReturnType<typeof getAllUsers>[number][] {
  return getAllUsers().filter((u) => u.status === "deactivated");
}
