/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { createHash, randomUUID, createHmac } from "crypto";
import { loadConfig, saveConfig } from "../config/index";
import type { LicenseInfo, Tier, EnterpriseFeature, LicenseStatus } from "./types";
import { TIER_FEATURES } from "./types";

let cachedLicense: LicenseInfo | null = null;

function getLicenseSecret(): string {
  return process.env.MTC_LICENSE_SECRET ?? "";
}

export function getLicense(): LicenseInfo {
  if (cachedLicense) return cachedLicense;

  const cfg = loadConfig();
  const licenseData = cfg.license as Record<string, unknown> | undefined;

  if (licenseData?.key) {
    cachedLicense = {
      key: String(licenseData.key),
      tier: (licenseData.tier as Tier) ?? "community",
      status: (licenseData.status as LicenseStatus) ?? "invalid",
      organization: String(licenseData.organization ?? ""),
      activatedAt: String(licenseData.activatedAt ?? ""),
      expiresAt: String(licenseData.expiresAt ?? ""),
      features: (licenseData.features as EnterpriseFeature[]) ?? [],
      maxSeats: (licenseData.maxSeats as number) ?? 1,
      currentSeats: (licenseData.currentSeats as number) ?? 1,
    };
    return cachedLicense;
  }

  cachedLicense = {
    key: "",
    tier: "community",
    status: "active",
    organization: "Community",
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    features: [],
    maxSeats: 1,
    currentSeats: 1,
  };
  return cachedLicense;
}

export function setLicense(license: LicenseInfo): void {
  cachedLicense = license;
  saveConfig({ license: license as unknown as Record<string, unknown> });
}

export function activateLicense(key: string): { success: boolean; license?: LicenseInfo; error?: string } {
  const parsed = parseLicenseKey(key);
  if (!parsed) {
    return { success: false, error: "Invalid license key format or signature" };
  }

  if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
    return { success: false, error: "License key has expired" };
  }

  const license: LicenseInfo = {
    key,
    tier: parsed.tier,
    status: "active",
    organization: parsed.organization,
    activatedAt: new Date().toISOString(),
    expiresAt: parsed.expiresAt ?? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    features: TIER_FEATURES[parsed.tier] ?? [],
    maxSeats: parsed.maxSeats ?? 5,
    currentSeats: 1,
  };

  setLicense(license);
  return { success: true, license };
}

export function deactivateLicense(): void {
  cachedLicense = null;
  saveConfig({ license: undefined });
}

export function hasFeature(feature: EnterpriseFeature): boolean {
  const license = getLicense();
  if (license.status !== "active") return false;
  return license.features.includes(feature);
}

export function getEffectiveTier(): Tier {
  return getLicense().tier;
}

export function isEnterprise(): boolean {
  return getLicense().tier !== "community";
}

export function generateLicenseKey(tier: Tier, organization: string, expiresAt: string, maxSeats: number): string {
  const secret = getLicenseSecret();
  const payload = `${tier}:${organization}:${expiresAt}:${maxSeats}`;
  const sig = secret
    ? createHmac("sha256", secret).update(payload).digest("hex").toUpperCase().slice(0, 16)
    : createHash("sha256").update(payload + randomUUID()).digest("hex").toUpperCase().slice(0, 16);

  const raw = `MTC-${tier.toUpperCase()}-${organization.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8)}-${sig}`;
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

function parseLicenseKey(key: string): { tier: Tier; organization: string; expiresAt: string; maxSeats: number } | null {
  const cleaned = key.replace(/-/g, "");
  const match = cleaned.match(/^MTC(ENTERPRISE(?:_PLUS)?|COMMUNITY)([A-Z0-9]+)([A-F0-9]{16})$/i);
  if (!match) return null;

  const tierMap: Record<string, Tier> = {
    COMMUNITY: "community",
    ENTERPRISE: "enterprise",
    ENTERPRISE_PLUS: "enterprise-plus",
  };

  const tierStr = match[1].toUpperCase();
  const tier = tierMap[tierStr];
  if (!tier) return null;

  const organization = match[2] ?? "Unknown";
  const sigFromKey = match[3];

  const secret = getLicenseSecret();
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const maxSeats = tier === "community" ? 1 : tier === "enterprise" ? 50 : 500;

  if (secret) {
    const payload = `${tier}:${organization}:${expiresAt}:${maxSeats}`;
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex").toUpperCase().slice(0, 16);
    if (sigFromKey !== expectedSig) {
      return null;
    }
  } else {
    console.warn("[mtc] MTC_LICENSE_SECRET not set — license key signature NOT verified!");
  }

  return {
    tier,
    organization,
    expiresAt,
    maxSeats,
  };
}

export function formatLicenseInfo(license: LicenseInfo): string {
  const lines = [
    `License Key:    ${license.key.slice(0, 20)}...`,
    `Tier:           ${license.tier}`,
    `Status:         ${license.status}`,
    `Organization:   ${license.organization}`,
    `Seats:          ${license.currentSeats}/${license.maxSeats}`,
    `Activated:      ${license.activatedAt.slice(0, 10)}`,
    `Expires:        ${license.expiresAt.slice(0, 10)}`,
    `Features:       ${license.features.length > 0 ? license.features.join(", ") : "None (community tier)"}`,
  ];
  return lines.join("\n");
}
