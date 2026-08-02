/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { createHmac } from "crypto";
import { loadConfig, saveConfig } from "../config/index";
import type { LicenseInfo, Tier, EnterpriseFeature } from "./types";
import { TIER_FEATURES } from "./types";
import { safeCompare } from "../utils/security";

let cachedLicense: LicenseInfo | null = null;

function getLicenseSecret(): string {
  return process.env.MTC_LICENSE_SECRET ?? "";
}

type LicensePayload = {
  tier: Tier;
  organization: string;
  expiresAt: string;
  maxSeats: number;
};

export function generateLicenseKey(tier: Tier, organization: string, expiresAt: string, maxSeats: number): string {
  const payload: LicensePayload = { tier, organization, expiresAt, maxSeats };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = createHmac("sha256", getLicenseSecret()).update(b64).digest("hex");
  return `MTC-${tier}-${b64}-${hmac}`;
}

export function parseLicenseKey(key: string): LicenseInfo | null {
  return decodeLicenseKey(key).license ?? null;
}

function decodeLicenseKey(key: string): { license?: LicenseInfo; error?: string } {
  const secret = getLicenseSecret();
  if (!secret) {
    return { error: "MTC_LICENSE_SECRET not set — license cannot be verified" };
  }

  const match = key.match(/^MTC-(enterprise-plus|enterprise|community)-([A-Za-z0-9_-]+)-([a-f0-9]{64})$/i);
  if (!match) return { error: "Invalid license key format" };

  const tier = match[1].toLowerCase() as Tier;
  const b64 = match[2];
  const hmac = match[3].toLowerCase();
  const expected = createHmac("sha256", secret).update(b64).digest("hex");
  if (!safeCompare(expected, hmac)) return { error: "Invalid license signature" };

  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as LicensePayload;
  } catch {
    return { error: "Invalid license payload" };
  }

  if (payload.tier !== tier) return { error: "Tier mismatch" };
  if (!payload.expiresAt || new Date(payload.expiresAt).getTime() <= Date.now()) {
    return { error: "License key has expired" };
  }

  return {
    license: {
      key,
      tier,
      status: "active",
      organization: payload.organization,
      activatedAt: new Date().toISOString(),
      expiresAt: payload.expiresAt,
      features: TIER_FEATURES[tier] ?? [],
      maxSeats: payload.maxSeats,
      currentSeats: 1,
    },
  };
}

function communityLicense(): LicenseInfo {
  return {
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
}

export function getLicense(): LicenseInfo {
  if (cachedLicense) return cachedLicense;

  const cfg = loadConfig();
  const licenseData = cfg.license as Record<string, unknown> | undefined;

  if (licenseData?.key) {
    const parsed = parseLicenseKey(String(licenseData.key));
    if (parsed) {
      cachedLicense = parsed;
      return cachedLicense;
    }
  }

  cachedLicense = communityLicense();
  return cachedLicense;
}

export function setLicense(license: LicenseInfo): void {
  cachedLicense = license;
  saveConfig({ license: license as unknown as Record<string, unknown> });
}

export function activateLicense(key: string): { success: boolean; license?: LicenseInfo; error?: string } {
  const result = decodeLicenseKey(key);
  if (!result.license) {
    return { success: false, error: result.error ?? "Invalid license key" };
  }
  setLicense(result.license);
  return { success: true, license: result.license };
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
