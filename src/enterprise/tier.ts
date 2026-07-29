import type { Tier, EnterpriseFeature } from "./types";
import { FEATURE_TIER_MAP } from "./types";
import { getLicense, isEnterprise, hasFeature } from "./license";
import { getConnectedCount } from "../mcp/index";

export type FeatureCheck = {
  feature: EnterpriseFeature;
  available: boolean;
  tier: string;
};

export function getAvailableFeatures(): FeatureCheck[] {
  const features: EnterpriseFeature[] = [
    "web_dashboard", "audit_logs", "team_analytics", "rbac", "sso",
    "soc2_compliance", "hosted_fine_tuned_models", "priority_support",
    "on_prem_deployment", "slack_integration", "license_server",
  ];

  return features.map((f) => ({
    feature: f,
    available: hasFeature(f),
    tier: FEATURE_TIER_MAP[f] ?? "enterprise",
  }));
}

export function getSystemStatus(): {
  tier: Tier;
  licenseStatus: string;
  enterprise: boolean;
  connectedMcpServers: number;
  activeAgents: number;
  features: FeatureCheck[];
} {
  const license = getLicense();
  return {
    tier: license.tier,
    licenseStatus: license.status,
    enterprise: isEnterprise(),
    connectedMcpServers: getConnectedCount(),
    activeAgents: 0,
    features: getAvailableFeatures(),
  };
}

export function gateEnterprise(feature: EnterpriseFeature): void {
  if (!hasFeature(feature)) {
    const requiredTier = FEATURE_TIER_MAP[feature] ?? "enterprise";
    throw new Error(
      `This feature requires the "${requiredTier}" tier. ` +
      `Activate an enterprise license with: mtc enterprise activate <key>`,
    );
  }
}
