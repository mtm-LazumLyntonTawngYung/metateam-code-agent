/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { randomUUID } from "crypto";
import { addOrgMember, createOrganization, listOrganizations, touchOrgMember } from "./org";
import { getLicense } from "./license";
import { loadConfig } from "../config";

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
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt ?? "",
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      orgTier: org.tier,
    })),
  );
}
