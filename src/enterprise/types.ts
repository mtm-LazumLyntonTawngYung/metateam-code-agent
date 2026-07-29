export type Tier = "community" | "enterprise" | "enterprise-plus";

export type EnterpriseFeature =
  | "web_dashboard"
  | "audit_logs"
  | "team_analytics"
  | "sso"
  | "soc2_compliance"
  | "hosted_fine_tuned_models"
  | "priority_support"
  | "on_prem_deployment"
  | "rbac"
  | "slack_integration"
  | "license_server";

export type LicenseStatus = "active" | "expired" | "invalid" | "revoked";

export type LicenseInfo = {
  key: string;
  tier: Tier;
  status: LicenseStatus;
  organization: string;
  activatedAt: string;
  expiresAt: string;
  features: EnterpriseFeature[];
  maxSeats: number;
  currentSeats: number;
};

export type AuditEvent = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  ip?: string;
  sessionId?: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  tier: Tier;
  createdAt: string;
  members: OrgMember[];
  settings: OrgSettings;
};

export type OrgMember = {
  userId: string;
  email: string;
  role: "admin" | "member" | "viewer";
  joinedAt: string;
};

export type OrgSettings = {
  ssoEnabled: boolean;
  auditLogRetentionDays: number;
  maxConcurrentSessions: number;
  allowedDomains: string[];
  enforceMfa: boolean;
};

export const FEATURE_TIER_MAP: Record<EnterpriseFeature, Tier> = {
  web_dashboard: "enterprise",
  audit_logs: "enterprise",
  team_analytics: "enterprise",
  rbac: "enterprise",
  slack_integration: "enterprise",
  sso: "enterprise-plus",
  soc2_compliance: "enterprise-plus",
  hosted_fine_tuned_models: "enterprise-plus",
  priority_support: "enterprise-plus",
  on_prem_deployment: "enterprise-plus",
  license_server: "enterprise-plus",
};

export const TIER_FEATURES: Record<Tier, EnterpriseFeature[]> = {
  community: [],
  enterprise: ["web_dashboard", "audit_logs", "team_analytics", "rbac", "slack_integration"],
  "enterprise-plus": [
    "web_dashboard", "audit_logs", "team_analytics", "rbac", "slack_integration",
    "sso", "soc2_compliance", "hosted_fine_tuned_models", "priority_support",
    "on_prem_deployment", "license_server",
  ],
};
