import { createHash, randomUUID } from "crypto";
import { loadConfig, saveConfig } from "../config/index";
import type { LicenseInfo, Tier, EnterpriseFeature, LicenseStatus } from "./types";
import { TIER_FEATURES } from "./types";

let cachedLicense: LicenseInfo | null = null;

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
    return { success: false, error: "Invalid license key format" };
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
  const seed = `${tier}-${organization}-${expiresAt}-${maxSeats}-${randomUUID()}`;
  const hash = createHash("sha256").update(seed).digest("hex").toUpperCase();
  const raw = `MTC-${tier.toUpperCase()}-${organization.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8)}-${hash.slice(0, 24)}`;
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

function parseLicenseKey(key: string): { tier: Tier; organization: string; expiresAt: string; maxSeats: number } | null {
  const cleaned = key.replace(/-/g, "");
  const match = cleaned.match(/^MTC(ENTERPRISE|COMMUNITY|ENTERPRISE_PLUS)([A-Z0-9]+)[A-F0-9]{24}$/i);
  if (!match) return null;

  const tierMap: Record<string, Tier> = {
    COMMUNITY: "community",
    ENTERPRISE: "enterprise",
    ENTERPRISE_PLUS: "enterprise-plus",
  };

  const tierStr = match[1].toUpperCase();
  const tier = tierMap[tierStr];
  if (!tier) return null;

  return {
    tier,
    organization: match[2] ?? "Unknown",
    expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    maxSeats: tier === "community" ? 1 : tier === "enterprise" ? 50 : 500,
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
