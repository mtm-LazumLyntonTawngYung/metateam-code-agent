/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

export { getLicense, activateLicense, deactivateLicense, hasFeature, isEnterprise, getEffectiveTier, formatLicenseInfo, generateLicenseKey } from "./license";
export type { LicenseInfo } from "./types";

export { recordAuditEvent, queryAuditLogs, getAuditStats, clearAuditLogs } from "./audit";
export type { AuditEvent } from "./types";

export { createOrganization, getOrganization, listOrganizations, addOrgMember, removeOrgMember, updateOrgTier, updateOrgSettings } from "./org";
export type { Organization, OrgMember, OrgSettings } from "./types";

export { getAvailableFeatures, getSystemStatus, gateEnterprise } from "./tier";
export type { FeatureCheck } from "./tier";

export { startDashboard } from "./dashboard";

export type { Tier, EnterpriseFeature, LicenseStatus } from "./types";
export { TIER_FEATURES, FEATURE_TIER_MAP } from "./types";
