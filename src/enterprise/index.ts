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

export { recordAuditEvent, queryAuditLogs, getAuditStats, clearAuditLogs, verifyAuditIntegrity, buildAuditChain, verifyAuditChain, computeAuditHash } from "./audit";
export type { AuditEvent } from "./types";

export { createOrganization, getOrganization, listOrganizations, addOrgMember, removeOrgMember, updateOrgTier, updateOrgSettings, touchOrgMember } from "./org";
export type { Organization, OrgMember, OrgSettings } from "./types";

export { ensureUserProvisioned, getAllUsers } from "./user";

export {
  createNotification,
  listNotifications,
  getNotificationStats,
  updateNotification,
  markAllRead,
  deleteNotification,
  clearNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./notifications";
export type { DashboardNotification, NotificationPreferences, NotificationLevel } from "./notifications";

export { getAvailableFeatures, getSystemStatus, gateEnterprise } from "./tier";
export type { FeatureCheck } from "./tier";

export {
  recordSecurityEvent,
  querySecurityEvents,
  getSecurityEventStats,
  detectThreats,
  classifyThreatSeverity,
  listSecurityAlerts,
  createSecurityAlert,
  resolveSecurityAlert,
  deleteSecurityAlert,
  clearSecurityAlerts,
  getSecurityPolicies,
  updateSecurityPolicy,
  computeComplianceStatus,
} from "./security";
export type {
  SecurityEvent,
  SecurityThreat,
  SecurityAlert,
  SecurityPolicy,
  ComplianceStatus,
  SecuritySeverity,
} from "./security";

export {
  PERMISSION_CATALOG,
  ALL_PERMISSIONS,
  BUILTIN_ROLE_TEMPLATES,
  ensureBuiltinRoles,
  listRoles,
  getRole,
  getRoleByName,
  createRole,
  updateRole,
  deleteRole,
  cloneRole,
  assignRoleToUser,
  removeRoleFromUser,
  getUserRoles,
  getUsersForRole,
  listRoleAssignments,
  resolveEffectivePermissionsForUser,
  checkPermission,
  computeEffectivePermissions,
  getRbacAnalytics,
} from "./rbac";
export type { RbacRole, PermissionGroup } from "./rbac";

export { startDashboard } from "./dashboard";

export type { Tier, EnterpriseFeature, LicenseStatus } from "./types";
export { TIER_FEATURES, FEATURE_TIER_MAP } from "./types";
