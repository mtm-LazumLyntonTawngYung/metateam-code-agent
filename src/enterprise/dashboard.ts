/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getLicense, formatLicenseInfo, activateLicense, deactivateLicense, generateLicenseKey } from "./license";

function generateLicenseKeyFor(tier: Tier, organization: string, expiresAt: string, maxSeats: number): string {
  return generateLicenseKey(tier, organization, expiresAt, maxSeats);
}
import { recordAuditEvent, queryAuditLogs, getAuditStats, verifyAuditIntegrity } from "./audit";
import { listOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization, updateOrgSettings, isValidSlug, slugExists } from "./org";
import { getAllUsers, createUser, updateUser, deactivateUser, countActiveUsers } from "./user";
import {
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
import type { Tier } from "./types";
import { getSystemStatus } from "./tier";
import { getConnectedServers } from "../mcp/index";
import { getAllAgents } from "../agents/index";
import {
  generateReport,
  estimateCosts,
  buildOptimizationRecommendations,
  computeTrends,
  forecastSeries,
  comparePeriods,
} from "../telemetry/reporter";
import {
  isTelemetryEnabled,
  queryDailyTokens,
  queryEventTypeStats,
  queryModelPerformance,
  queryToolPerformance,
  queryModelTrends,
  queryDetailedEvents,
} from "../telemetry/store";
import { getDb } from "../session/db";
import { loadConfig, saveConfig } from "../config";
import { loadLlmConfig, saveLlmConfig, getConfiguredModelIds } from "../llm/config";
import {
  CONFIG_SCHEMA,
  getConfigDefaults,
  validateConfig,
  maskConfig,
  flattenSchema,
} from "../config/schema";
import {
  attachRealtimeServer,
  isValidChannel,
  broadcastHealth,
  broadcastStatus,
  broadcastSessions,
  broadcastLicense,
} from "./realtime";
import {
  toCSV,
  serializeExport,
  listExports,
  recordExport,
  deleteExport,
  clearExports,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  touchTemplateLastRun,
  dueScheduledTemplates,
} from "./exports";
import type { ExportFormat, ExportTemplate } from "./exports";
import {
  recordSecurityEvent,
  querySecurityEvents,
  getSecurityEventStats,
  detectThreats,
  listSecurityAlerts,
  createSecurityAlert,
  resolveSecurityAlert,
  deleteSecurityAlert,
  clearSecurityAlerts,
  getSecurityPolicies,
  updateSecurityPolicy,
  getSecurityPolicy,
  computeComplianceStatus,
} from "./security";
import type { SecurityPolicy, SecuritySeverity } from "./security";
import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  cloneRole,
  assignRoleToUser,
  removeRoleFromUser,
  getUserRoles,
  getUsersForRole,
  listRoleAssignments,
  PERMISSION_CATALOG,
  resolveEffectivePermissionsForUser,
  getRbacAnalytics,
  ensureBuiltinRoles,
} from "./rbac";

const DASHBOARD_USER = process.env.MTC_DASHBOARD_USER ?? "";
const DASHBOARD_PASSWORD = process.env.MTC_DASHBOARD_PASSWORD ?? "";
const SESSION_COOKIE = "mtc_dash";
const SESSION_MAX_AGE = 8 * 60 * 60;

function ensureSessionsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);
}

function cleanupExpiredSessions(): void {
  getDb().exec("DELETE FROM dashboard_sessions WHERE expires_at < datetime('now')");
}

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

const mgmtOps = new Map<string, { count: number; resetAt: number }>();
const MGMT_OP_LIMIT = 60;
const MGMT_OP_WINDOW = 60 * 1000;

function checkMgmtRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = mgmtOps.get(ip);
  if (record && now < record.resetAt) {
    if (record.count >= MGMT_OP_LIMIT) {
      return { allowed: false, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
    }
    record.count++;
    return { allowed: true };
  }
  mgmtOps.set(ip, { count: 1, resetAt: now + MGMT_OP_WINDOW });
  return { allowed: true };
}

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (record && now < record.lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((record.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

function recordLoginAttempt(ip: string, success: boolean): void {
  const now = Date.now();
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const record = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  record.count++;
  if (record.count >= 5) {
    record.lockedUntil = now + 5 * 60 * 1000;
    record.count = 0;
  }
  loginAttempts.set(ip, record);
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function hasValidSession(req: Request): boolean {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) return false;
  const row = getDb().query(
    "SELECT 1 AS ok FROM dashboard_sessions WHERE token = ? AND expires_at > datetime('now')",
  ).get(token);
  return !!row;
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sanitizeIp(value: string): string {
  return value.replace(/[<>&"']/g, "");
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

async function handleLogin(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const limit = checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return jsonResponse(
      { error: "Too many failed attempts. Please try again later.", retryAfter: limit.retryAfter },
      429,
      { "Retry-After": String(limit.retryAfter) },
    );
  }

  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");
  const success = safeEqual(username, DASHBOARD_USER) && safeEqual(password, DASHBOARD_PASSWORD);
  recordLoginAttempt(ip, success);

  if (!success) {
    recordAuditEvent({
      actor: username,
      action: "dashboard.login_failed",
      resource: "dashboard",
      detail: `Failed attempt from ${sanitizeIp(ip)}`,
    });
    recordSecurityEvent({
      category: "auth",
      severity: "medium",
      actor: username || "unknown",
      action: "auth.login.failed",
      resource: "dashboard",
      detail: `Failed login attempt from ${sanitizeIp(ip)}`,
      ip: sanitizeIp(ip),
    });
    return jsonResponse({ error: "Invalid username or password" }, 401);
  }

  recordAuditEvent({
    actor: username,
    action: "dashboard.login",
    resource: "dashboard",
    detail: `Login from ${ip}`,
  });
  recordSecurityEvent({
    category: "auth",
    severity: "info",
    actor: username || "dashboard",
    action: "auth.login.success",
    resource: "dashboard",
    detail: `Successful login from ${sanitizeIp(ip)}`,
    ip: sanitizeIp(ip),
  });

  const token = randomBytes(32).toString("hex");
  getDb().run(
    "INSERT INTO dashboard_sessions (token, created_at, expires_at) VALUES (?, datetime('now'), datetime('now', '+8 hours'))",
    [token],
  );
  return jsonResponse({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
}

function handleLogout(req: Request): Response {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (token) {
    getDb().run("DELETE FROM dashboard_sessions WHERE token = ?", [token]);
  }
  return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
}

function userIdFromPath(path: string): string | null {
  const match = path.match(/^\/api\/users\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mgmtRateResponse(): Response {
  return jsonResponse({ error: "Too many management operations. Try again later." }, 429, { "Retry-After": "60" });
}

function permissionDeniedResponse(permission: string): Response {
  return jsonResponse({ error: `Forbidden: requires permission "${permission}"` }, 403);
}

function rbacEnabled(): boolean {
  return getSecurityPolicy("enforceRbac")?.enabled ?? true;
}

function requirePermission(permission: string): Response | null {
  if (!rbacEnabled()) return null;
  const user = getAllUsers().find((u) => u.email.toLowerCase() === DASHBOARD_USER.toLowerCase());
  if (!user) return null;
  return resolveEffectivePermissionsForUser(user.userId).has(permission)
    ? null
    : permissionDeniedResponse(permission);
}

function currentUserHasPermission(permission: string): boolean {
  if (!rbacEnabled()) return true;
  const user = getAllUsers().find((u) => u.email.toLowerCase() === DASHBOARD_USER.toLowerCase());
  if (!user) return true;
  return resolveEffectivePermissionsForUser(user.userId).has(permission);
}

async function handleCreateUser(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const result = createUser({
    email: String(body.email ?? ""),
    role: body.role !== undefined ? String(body.role) : undefined,
    orgId: body.orgId !== undefined ? String(body.orgId) : undefined,
  });

  if (!result.ok) return jsonResponse({ error: result.error }, 400);

  recordAuditEvent({
    actor: "dashboard",
    action: "user.create",
    resource: `users/${result.user.userId}`,
    detail: `Created user ${result.user.email} (${result.user.role}) in ${result.user.orgName}`,
    ip,
  });
  recordSecurityEvent({
    category: "access",
    severity: "info",
    actor: "dashboard",
    action: "user.create",
    resource: `users/${result.user.userId}`,
    detail: `Created user ${result.user.email} with role ${result.user.role}`,
    ip,
  });
  return jsonResponse({ user: result.user }, 201);
}

async function handleUpdateUser(req: Request, userId: string): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const result = updateUser(userId, {
    email: body.email !== undefined ? String(body.email) : undefined,
    role: body.role !== undefined ? String(body.role) : undefined,
    status: body.status !== undefined ? String(body.status) : undefined,
  });

  if (!result.ok) return jsonResponse({ error: result.error }, 400);

  recordAuditEvent({
    actor: "dashboard",
    action: "user.update",
    resource: `users/${userId}`,
    detail: `Updated user ${result.user.email} (role: ${result.user.role}, status: ${result.user.status})`,
    ip,
  });
  recordSecurityEvent({
    category: "access",
    severity: "low",
    actor: "dashboard",
    action: "user.update",
    resource: `users/${userId}`,
    detail: `Updated user ${result.user.email} (role: ${result.user.role}, status: ${result.user.status})`,
    ip,
  });
  return jsonResponse({ user: result.user });
}

async function handleDeleteUser(req: Request, userId: string): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const result = deactivateUser(userId);
  if (!result.ok) return jsonResponse({ error: result.error }, 400);

  recordAuditEvent({
    actor: "dashboard",
    action: "user.deactivate",
    resource: `users/${userId}`,
    detail: `Deactivated user ${result.user.email}`,
    ip,
  });
  recordSecurityEvent({
    category: "access",
    severity: "medium",
    actor: "dashboard",
    action: "user.deactivate",
    resource: `users/${userId}`,
    detail: `Deactivated user ${result.user.email}`,
    ip,
  });
  createNotification({
    level: "warning",
    title: "User deactivated",
    message: `${result.user.email} can no longer sign in.`,
    source: "users",
  });
  broadcastStatus({ resource: "users", action: "deactivate", userId });
  return jsonResponse({ user: result.user });
}

function orgIdFromPath(path: string): string | null {
  const match = path.match(/^\/api\/orgs\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleCreateOrg(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const name = String(body.name ?? "").trim();
  const rawSlug = String(body.slug ?? "").trim().toLowerCase();
  if (!name) return jsonResponse({ error: "Organization name is required" }, 400);

  let slug = rawSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!isValidSlug(slug)) {
    return jsonResponse({ error: "Slug must be lowercase alphanumeric with hyphens (e.g. acme-corp)" }, 400);
  }
  if (slugExists(slug)) {
    return jsonResponse({ error: "Organization slug already in use" }, 409);
  }

  const tier = String(body.tier ?? "community") as Tier;
  if (!["community", "enterprise", "enterprise-plus"].includes(tier)) {
    return jsonResponse({ error: "Tier must be one of: community, enterprise, enterprise-plus" }, 400);
  }

  const org = createOrganization(name, slug, tier);
  recordAuditEvent({
    actor: "dashboard",
    action: "org.create",
    resource: `orgs/${org.id}`,
    detail: `Created organization ${org.name} (${org.slug})`,
    ip,
  });
  return jsonResponse({ organization: org }, 201);
}

async function handleUpdateOrg(req: Request, orgId: string): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  try {
    const changes: { name?: string; slug?: string; tier?: Tier } = {};
    if (body.name !== undefined) changes.name = String(body.name);
    if (body.slug !== undefined) changes.slug = String(body.slug);
    if (body.tier !== undefined) changes.tier = String(body.tier) as Tier;

    if (body.settings !== undefined && typeof body.settings === "object") {
      const org = updateOrgSettings(orgId, body.settings as never);
      if (!org) return jsonResponse({ error: "Organization not found" }, 404);
      recordAuditEvent({
        actor: "dashboard",
        action: "org.settings",
        resource: `orgs/${orgId}`,
        detail: `Updated settings for ${org.name}`,
        ip,
      });
      return jsonResponse({ organization: org });
    }

    const org = updateOrganization(orgId, changes);
    if (!org) return jsonResponse({ error: "Organization not found" }, 404);
    recordAuditEvent({
      actor: "dashboard",
      action: "org.update",
      resource: `orgs/${orgId}`,
      detail: `Updated organization ${org.name}`,
      ip,
    });
    return jsonResponse({ organization: org });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 400);
  }
}

async function handleDeleteOrg(req: Request, orgId: string): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const org = getOrganization(orgId);
  if (!org) return jsonResponse({ error: "Organization not found" }, 404);

  if (!deleteOrganization(orgId)) return jsonResponse({ error: "Organization not found" }, 404);
  recordAuditEvent({
    actor: "dashboard",
    action: "org.delete",
    resource: `orgs/${orgId}`,
    detail: `Deleted organization ${org.name}`,
    ip,
  });
  return jsonResponse({ ok: true });
}

async function handleActivateLicense(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const key = String(body.key ?? "").trim();
  if (!key) return jsonResponse({ error: "License key is required" }, 400);

  const before = getLicense();
  const result = activateLicense(key);
  if (!result.success) {
    recordAuditEvent({
      actor: "dashboard",
      action: "license.activate_failed",
      resource: "license",
      detail: result.error ?? "Invalid license key",
      ip,
    });
    return jsonResponse({ error: result.error ?? "Invalid license key" }, 400);
  }

  const after = getLicense();
  const upgraded = before.tier !== after.tier;
  recordAuditEvent({
    actor: "dashboard",
    action: upgraded ? "license.upgrade" : "license.activate",
    resource: "license",
    detail: `Activated ${after.tier} license for ${after.organization} (${after.maxSeats} seats)`,
    ip,
  });
  createNotification({
    level: "success",
    title: upgraded ? "License upgraded" : "License activated",
    message: `Activated ${after.tier} license for ${after.organization} (${after.maxSeats} seats)`,
    source: "license",
  });
  broadcastLicense({ status: "active", tier: after.tier, seats: after.maxSeats });
  return jsonResponse({ license: after, formatted: formatLicenseInfo(after), upgraded }, 200);
}

function handleValidateLicense(): Response {
  const license = getLicense();
  const active = countActiveUsers();
  const valid = license.status === "active";
  return jsonResponse({
    valid,
    license: { ...license, currentSeats: active },
    seats: { used: active, total: license.maxSeats },
    expiresIn: valid ? Math.max(0, new Date(license.expiresAt).getTime() - Date.now()) : 0,
  });
}

async function handleDeactivateLicense(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const license = getLicense();
  deactivateLicense();
  recordAuditEvent({
    actor: "dashboard",
    action: "license.deactivate",
    resource: "license",
    detail: `Deactivated ${license.tier} license for ${license.organization}`,
    ip,
  });
  createNotification({
    level: "warning",
    title: "License deactivated",
    message: `Deactivated ${license.tier} license for ${license.organization}. Dashboard is now on community tier.`,
    source: "license",
  });
  return jsonResponse({ ok: true });
}

async function handleLicenseSeats(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const license = getLicense();
  const used = countActiveUsers();
  const desired = body.maxSeats !== undefined ? parseInt(String(body.maxSeats), 10) : license.maxSeats;
  if (!Number.isFinite(desired) || desired < used) {
    return jsonResponse({ error: `Max seats must be at least the current active user count (${used})` }, 400);
  }
  if (!process.env.MTC_LICENSE_SECRET) {
    return jsonResponse({ error: "MTC_LICENSE_SECRET is not configured on this server; seat changes are disabled" }, 400);
  }

  const expiresAt = license.expiresAt;
  const organization = license.organization;
  const tier = license.tier as Tier;
  const key = generateLicenseKeyFor(tier, organization, expiresAt, desired);
  const result = activateLicense(key);
  if (!result.success) return jsonResponse({ error: result.error ?? "Failed to update seats" }, 400);

  recordAuditEvent({
    actor: "dashboard",
    action: "license.seats",
    resource: "license",
    detail: `Adjusted seats to ${desired} for ${organization}`,
    ip,
  });
  return jsonResponse({ license: getLicense(), seats: { used, total: desired } });
}

function maskedConfigForResponse(): Record<string, unknown> {
  const masked = maskConfig(loadConfig() as Record<string, unknown>) as Record<string, unknown>;
  if (masked.license && typeof masked.license === "object") {
    masked.license = { ...(masked.license as Record<string, unknown>), key: undefined };
  }
  return masked;
}

function handleGetConfig(): Response {
  const masked = maskedConfigForResponse();
  const llm = loadLlmConfig();
  return jsonResponse({
    config: masked,
    llm: {
      providers: llm.providers.map((p) => ({
        id: p.id,
        label: p.label,
        apiKey: p.apiKey ? "********" : "",
        baseUrl: p.baseUrl,
        models: p.models,
      })),
      routing: llm.routing,
    },
    modelIds: getConfiguredModelIds(),
  });
}

function handleGetConfigSchema(): Response {
  return jsonResponse({ schema: CONFIG_SCHEMA, fields: flattenSchema() });
}

function handleGetConfigDefaults(): Response {
  return jsonResponse({ defaults: getConfigDefaults(), schema: CONFIG_SCHEMA });
}

function handleValidateConfigRequest(req: Request): Promise<Response> {
  return readJson(req).then((body) => {
    if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
    const { ok, normalized, errors } = validateConfig(body.config ?? {});
    return jsonResponse({ ok, errors, normalized: ok ? maskConfig(normalized) : undefined });
  });
}

async function handleUpdateConfig(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const { ok, normalized, errors } = validateConfig(body.config ?? {});
  if (!ok) return jsonResponse({ error: "Validation failed", errors }, 400);

  const current = loadConfig() as Record<string, unknown>;
  const merged = { ...current, ...normalized };
  saveConfig(merged as never);

  if (body.llm && typeof body.llm === "object") {
    const llmBody = body.llm as Record<string, unknown>;
    const currentLlm = loadLlmConfig();
    if (llmBody.routing && typeof llmBody.routing === "object") {
      const routing = llmBody.routing as Record<string, unknown>;
      saveLlmConfig({
        routing: {
          simpleModel: String(routing.simpleModel ?? currentLlm.routing.simpleModel),
          defaultModel: String(routing.defaultModel ?? currentLlm.routing.defaultModel),
          reasoningModel: String(routing.reasoningModel ?? currentLlm.routing.reasoningModel),
        },
      });
    }
  }

  recordAuditEvent({
    actor: "dashboard",
    action: "config.update",
    resource: "config",
    detail: `Updated configuration (${Object.keys(normalized).join(", ") || "none"})`,
    ip,
  });

  broadcastStatus({ updated: Object.keys(normalized) });

  return jsonResponse({ ok: true, config: maskedConfigForResponse() });
}

function getActiveSessions(): Array<{ id: string; label: string; createdAt: string; updatedAt: string; messageCount: number; tokens: number }> {
  const db = getDb();
  const rows = db.query(
    `SELECT s.id, s.label, s.created_at, s.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count,
            (SELECT COALESCE(SUM(token_count), 0) FROM messages m WHERE m.session_id = s.id AND m.pruned = 0) as tokens
     FROM sessions s ORDER BY s.updated_at DESC LIMIT 50`,
  ).all() as Array<{ id: string; label: string | null; created_at: string; updated_at: string; message_count: number; tokens: number }>;
  return rows.map((r) => ({
    id: r.id,
    label: r.label ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
    tokens: r.tokens,
  }));
}

const NOTIFICATION_LEVELS = ["info", "success", "warning", "critical"];

function handleListNotifications(url: URL): Response {
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const level = url.searchParams.get("level") ?? "all";
  const read = url.searchParams.get("read") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const notifications = listNotifications({ limit, offset, level, read: read as "read" | "unread" | undefined, source });
  const stats = getNotificationStats();
  return jsonResponse({ notifications, stats });
}

function handleNotificationDetail(url: URL): Response {
  const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  const matches = listNotifications({ limit: 500 }).filter((n) => n.id === id);
  if (matches.length === 0) return jsonResponse({ error: "Notification not found" }, 404);
  return jsonResponse({ notification: matches[0] });
}

async function handleCreateNotification(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const level = String(body.level ?? "info");
  if (!NOTIFICATION_LEVELS.includes(level)) {
    return jsonResponse({ error: "Level must be one of: info, success, warning, critical" }, 400);
  }
  const title = String(body.title ?? "").trim();
  if (!title) return jsonResponse({ error: "Notification title is required" }, 400);

  const notification = createNotification({
    level: level as "info" | "success" | "warning" | "critical",
    title,
    message: body.message !== undefined ? String(body.message) : undefined,
    source: body.source !== undefined ? String(body.source) : undefined,
  });

  recordAuditEvent({
    actor: "dashboard",
    action: "notification.create",
    resource: `notifications/${notification.id}`,
    detail: `Created ${level} notification "${title}"`,
    ip,
  });
  return jsonResponse({ notification }, 201);
}

async function handleUpdateNotification(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  const updated = updateNotification(id, { read: body.read === undefined ? undefined : Boolean(body.read) });
  if (!updated) return jsonResponse({ error: "Notification not found" }, 404);

  recordAuditEvent({
    actor: "dashboard",
    action: "notification.update",
    resource: `notifications/${id}`,
    detail: `Marked notification ${updated.read ? "read" : "unread"}`,
    ip,
  });
  return jsonResponse({ notification: updated });
}

async function handleDeleteNotification(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (!deleteNotification(id)) return jsonResponse({ error: "Notification not found" }, 404);

  recordAuditEvent({
    actor: "dashboard",
    action: "notification.delete",
    resource: `notifications/${id}`,
    detail: "Deleted notification",
    ip,
  });
  return jsonResponse({ ok: true });
}

async function handleMarkAllNotifications(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const changed = markAllRead();
  recordAuditEvent({
    actor: "dashboard",
    action: "notification.mark_all_read",
    resource: "notifications",
    detail: `Marked ${changed} notifications as read`,
    ip,
  });
  return jsonResponse({ ok: true, changed });
}

async function handleClearNotifications(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const level = url.searchParams.get("level") ?? undefined;
  const changed = clearNotifications(level);
  recordAuditEvent({
    actor: "dashboard",
    action: "notification.clear",
    resource: "notifications",
    detail: `Cleared ${changed} notifications${level ? ` (level: ${level})` : ""}`,
    ip,
  });
  return jsonResponse({ ok: true, cleared: changed });
}

function handleGetNotificationPrefs(): Response {
  return jsonResponse({ preferences: getNotificationPreferences() });
}

async function handleUpdateNotificationPrefs(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const prefs: Record<string, unknown> = {};
  if (body.emailEnabled !== undefined) prefs.emailEnabled = Boolean(body.emailEnabled);
  if (body.slackEnabled !== undefined) prefs.slackEnabled = Boolean(body.slackEnabled);
  if (body.webhookUrl !== undefined) prefs.webhookUrl = String(body.webhookUrl);
  if (body.minLevel !== undefined) {
    const level = String(body.minLevel);
    if (!NOTIFICATION_LEVELS.includes(level)) {
      return jsonResponse({ error: "minLevel must be one of: info, success, warning, critical" }, 400);
    }
    prefs.minLevel = level;
  }

  const preferences = updateNotificationPreferences(prefs as never);
  recordAuditEvent({
    actor: "dashboard",
    action: "notification.prefs",
    resource: "notifications",
    detail: "Updated notification preferences",
    ip,
  });
  return jsonResponse({ preferences });
}

function parseIntParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  const value = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

function handleAnalyticsDetailed(url: URL): Response {
  const days = Math.min(Math.max(parseIntParam(url, "days", 30), 1), 365);
  const filters = {
    days,
    eventType: url.searchParams.get("eventType") ?? undefined,
    model: url.searchParams.get("model") ?? undefined,
    tool: url.searchParams.get("tool") ?? undefined,
    deviceId: url.searchParams.get("deviceId") ?? undefined,
    limit: parseIntParam(url, "limit", 100),
    offset: parseIntParam(url, "offset", 0),
  };
  const report = generateReport(days);
  return jsonResponse({
    filters,
    summary: {
      totalSessions: report.totalSessions,
      totalTokens: report.totalTokens,
      totalToolCalls: report.totalToolCalls,
      activeDevices: report.activeDevices,
    },
    modelStats: report.modelStats,
    toolStats: report.toolStats,
    costs: estimateCosts(report.modelStats),
    recommendations: buildOptimizationRecommendations(report.modelStats, report.toolStats),
    modelPerformance: queryModelPerformance(days),
    toolPerformance: queryToolPerformance(days),
    eventTypes: queryEventTypeStats(days),
    events: queryDetailedEvents(filters),
  });
}

async function handleAnalyticsReport(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const days = Math.min(Math.max(Number(body.days ?? 30) || 30, 1), 365);
  const includeRaw = Array.isArray(body.include)
    ? (body.include as unknown[]).map((i) => String(i))
    : ["summary", "models", "tools", "performance", "trends", "cost", "events"];
  const include = new Set(includeRaw);
  const model = body.model !== undefined ? String(body.model) : undefined;
  const tool = body.tool !== undefined ? String(body.tool) : undefined;

  const report = generateReport(days);
  const tokenSeries = queryDailyTokens(days).map((d) => d.tokens);
  const costReport = estimateCosts(report.modelStats);

  const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), days, filters: { model, tool } };

  if (include.has("summary")) {
    out.summary = {
      totalSessions: report.totalSessions,
      totalTokens: report.totalTokens,
      totalToolCalls: report.totalToolCalls,
      activeDevices: report.activeDevices,
    };
  }
  if (include.has("models")) {
    out.modelStats = model ? report.modelStats.filter((m) => m.model === model) : report.modelStats;
  }
  if (include.has("tools")) {
    out.toolStats = tool ? report.toolStats.filter((t) => t.tool_name === tool) : report.toolStats;
  }
  if (include.has("performance")) {
    const perfs = queryModelPerformance(days);
    const toolPerfs = queryToolPerformance(days);
    out.performance = {
      models: model ? perfs.filter((p) => p.model === model) : perfs,
      tools: tool ? toolPerfs.filter((p) => p.tool_name === tool) : toolPerfs,
    };
  }
  if (include.has("trends")) {
    out.trends = computeTrends(report.dailyStats, tokenSeries);
    out.dailyTokens = queryDailyTokens(days);
    out.modelTrends = model ? queryModelTrends(days).filter((t) => t.model === model) : queryModelTrends(days);
  }
  if (include.has("cost")) {
    out.costs = costReport;
    out.recommendations = buildOptimizationRecommendations(report.modelStats, report.toolStats);
  }
  if (include.has("events")) {
    out.events = queryDetailedEvents({ days, model, tool, limit: 100 });
  }

  recordAuditEvent({
    actor: "dashboard",
    action: "analytics.report",
    resource: "analytics",
    detail: `Generated analytics report (${days} days, sections: ${[...include].join(", ") || "none"})`,
    ip,
  });
  return jsonResponse(out);
}

function handleAnalyticsTrends(url: URL): Response {
  const days = Math.min(Math.max(parseIntParam(url, "days", 30), 1), 365);
  const report = generateReport(days);
  const tokenSeries = queryDailyTokens(days).map((d) => d.tokens);
  const dailyTokens = queryDailyTokens(days);
  const trends = computeTrends(report.dailyStats, tokenSeries);
  const calls = report.dailyStats.map((d) => d.total_tool_calls ?? 0);

  const tokenForecast = forecastSeries(tokenSeries, 7);
  const callsForecast = forecastSeries(calls, 7);
  const mid = Math.max(1, Math.floor(days / 2));
  const tokensComparison = comparePeriods(tokenSeries, mid);

  return jsonResponse({
    days,
    dates: trends.dates,
    calls: trends.calls,
    tokens: trends.tokens,
    movingAverage: trends.movingAvg,
    forecast: { calls: callsForecast, tokens: tokenForecast },
    comparison: trends.comparison,
    tokensComparison,
    dailyTokens,
    modelTrends: queryModelTrends(days),
  });
}

function downloadResponse(contentType: string, body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function exportFilename(source: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `mtc-${source}-${stamp}.${extension}`;
}

function handleExportAudit(url: URL): Response {
  const format: ExportFormat = url.searchParams.get("format") === "json" ? "json" : "csv";
  const options = {
    limit: Math.min(Math.max(parseIntParam(url, "limit", 5000), 1), 10000),
    actor: url.searchParams.get("actor") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined,
  };
  const logs = queryAuditLogs(options);
  const columns = ["id", "timestamp", "actor", "action", "resource", "detail", "ip", "sessionId"];
  const serialized = serializeExport(logs as unknown as Array<Record<string, unknown>>, format, columns);

  recordExport({
    source: "audit",
    format,
    filters: url.search,
    params: url.search,
    createdBy: "dashboard",
  });
  return downloadResponse(serialized.contentType, serialized.body, exportFilename("audit", serialized.extension));
}

function handleExportAnalytics(url: URL): Response {
  const format: ExportFormat = url.searchParams.get("format") === "json" ? "json" : "csv";
  const days = Math.min(Math.max(parseIntParam(url, "days", 30), 1), 365);
  const report = generateReport(days);

  if (format === "json") {
    const data = {
      generatedAt: new Date().toISOString(),
      days,
      totalSessions: report.totalSessions,
      totalTokens: report.totalTokens,
      totalToolCalls: report.totalToolCalls,
      activeDevices: report.activeDevices,
      dailyStats: report.dailyStats,
      modelStats: report.modelStats,
      toolStats: report.toolStats,
      costs: estimateCosts(report.modelStats),
    };
    const serialized = serializeExport(data, "json");
    recordExport({ source: "analytics", format, filters: url.search, params: url.search });
    return downloadResponse(serialized.contentType, serialized.body, exportFilename("analytics", "json"));
  }

  const tokenByDate = new Map(queryDailyTokens(days).map((d) => [d.date, d.tokens]));
  const rows = report.dailyStats.map((d) => ({
    date: d.date,
    tool_calls: d.total_tool_calls ?? 0,
    failures: d.tool_failures ?? 0,
    failure_rate: d.failure_rate ?? 0,
    sessions: d.unique_sessions ?? 0,
    tokens: tokenByDate.get(d.date) ?? 0,
  }));
  const serialized = serializeExport(rows, "csv", ["date", "tool_calls", "failures", "failure_rate", "sessions", "tokens"]);
  recordExport({ source: "analytics", format, filters: url.search, params: url.search });
  return downloadResponse(serialized.contentType, serialized.body, exportFilename("analytics", "csv"));
}

function handleExportUsers(url: URL): Response {
  const format: ExportFormat = url.searchParams.get("format") === "json" ? "json" : "csv";
  const role = url.searchParams.get("role") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const users = getAllUsers().filter((u) => {
    if (role && u.role !== role) return false;
    if (status && u.status !== status) return false;
    return true;
  });
  const columns = ["userId", "email", "role", "status", "orgName", "orgSlug", "orgTier", "joinedAt", "lastActiveAt"];
  const serialized = serializeExport(users as unknown as Array<Record<string, unknown>>, format, columns);

  recordExport({ source: "users", format, filters: url.search, params: url.search });
  return downloadResponse(serialized.contentType, serialized.body, exportFilename("users", serialized.extension));
}

function handleExportConfig(): Response {
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    config: maskedConfigForResponse(),
    llm: (() => {
      const llm = loadLlmConfig();
      return {
        providers: llm.providers.map((p) => ({ id: p.id, label: p.label, apiKey: p.apiKey ? "********" : "", baseUrl: p.baseUrl, models: p.models })),
        routing: llm.routing,
      };
    })(),
  };
  const serialized = serializeExport(data, "json");
  recordExport({ source: "config", format: "json", filters: "", params: "" });
  return downloadResponse(serialized.contentType, serialized.body, exportFilename("config", "json"));
}

function handleListExports(url: URL): Response {
  return jsonResponse({
    exports: listExports({
      limit: Math.min(Math.max(parseIntParam(url, "limit", 50), 1), 500),
      offset: Math.max(parseIntParam(url, "offset", 0), 0),
    }),
  });
}

async function handleRecordExport(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const source = String(body.source ?? "");
  const format = String(body.format ?? "csv") as ExportFormat;
  if (!["audit", "analytics", "users", "config"].includes(source)) {
    return jsonResponse({ error: "Source must be one of: audit, analytics, users, config" }, 400);
  }
  if (format !== "csv" && format !== "json") {
    return jsonResponse({ error: "Format must be one of: csv, json" }, 400);
  }
  const record = recordExport({
    source,
    format,
    filters: body.filters !== undefined ? String(body.filters) : "",
    params: body.params !== undefined ? String(body.params) : "",
    createdBy: "dashboard",
  });
  recordAuditEvent({
    actor: "dashboard",
    action: "export.create",
    resource: `exports/${record.id}`,
    detail: `Recorded ${format.toUpperCase()} export of ${source}`,
    ip,
  });
  return jsonResponse({ export: record }, 201);
}

async function handleDeleteExport(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (!deleteExport(id)) return jsonResponse({ error: "Export not found" }, 404);
  recordAuditEvent({
    actor: "dashboard",
    action: "export.delete",
    resource: `exports/${id}`,
    detail: "Deleted export record",
    ip,
  });
  return jsonResponse({ ok: true });
}

async function handleClearExports(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const cleared = clearExports();
  recordAuditEvent({
    actor: "dashboard",
    action: "export.clear",
    resource: "exports",
    detail: `Cleared ${cleared} export records`,
    ip,
  });
  return jsonResponse({ ok: true, cleared });
}

function handleListTemplates(): Response {
  return jsonResponse({ templates: listTemplates() });
}

async function handleCreateTemplate(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const template = createTemplate({
    name: String(body.name ?? ""),
    source: String(body.source ?? ""),
    format: String(body.format ?? "csv") as ExportFormat,
    filters: body.filters !== undefined ? String(body.filters) : "",
    schedule: (String(body.schedule ?? "none") as ExportTemplate["schedule"]),
  });
  if (!template) return jsonResponse({ error: "Invalid template: name, source, format and schedule are required" }, 400);
  recordAuditEvent({
    actor: "dashboard",
    action: "export.template_create",
    resource: `export-templates/${template.id}`,
    detail: `Created export template "${template.name}" (${template.source}/${template.format})`,
    ip,
  });
  return jsonResponse({ template }, 201);
}

async function handleUpdateTemplate(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  const updated = updateTemplate(id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    source: body.source !== undefined ? String(body.source) : undefined,
    format: body.format !== undefined ? (String(body.format) as ExportFormat) : undefined,
    filters: body.filters !== undefined ? String(body.filters) : undefined,
    schedule: body.schedule !== undefined ? (String(body.schedule) as ExportTemplate["schedule"]) : undefined,
  });
  if (!updated) return jsonResponse({ error: "Template not found or invalid" }, 400);
  recordAuditEvent({
    actor: "dashboard",
    action: "export.template_update",
    resource: `export-templates/${id}`,
    detail: `Updated export template "${updated.name}"`,
    ip,
  });
  return jsonResponse({ template: updated });
}

async function handleDeleteTemplate(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (!deleteTemplate(id)) return jsonResponse({ error: "Template not found" }, 404);
  recordAuditEvent({
    actor: "dashboard",
    action: "export.template_delete",
    resource: `export-templates/${id}`,
    detail: "Deleted export template",
    ip,
  });
  return jsonResponse({ ok: true });
}

const API_DESCRIPTIONS: Array<{ method: string; path: string; summary: string; params: string[] }> = [
  { method: "POST", path: "/api/login", summary: "Authenticate and start a dashboard session", params: ["username", "password"] },
  { method: "POST", path: "/api/logout", summary: "Invalidate the current dashboard session", params: [] },
  { method: "GET", path: "/api/health", summary: "Liveness probe with telemetry status", params: [] },
  { method: "GET", path: "/api/status", summary: "System status, tier and feature availability", params: [] },
  { method: "GET", path: "/api/license", summary: "Current license details", params: [] },
  { method: "GET", path: "/api/license/validate", summary: "Validate license and report seat usage", params: [] },
  { method: "POST", path: "/api/license/activate", summary: "Activate or upgrade a license", params: ["key"] },
  { method: "POST", path: "/api/license/deactivate", summary: "Deactivate the current license", params: [] },
  { method: "POST", path: "/api/license/seats", summary: "Adjust license seat count", params: ["maxSeats"] },
  { method: "GET", path: "/api/audit", summary: "Query audit log events with pagination and advanced filters", params: ["limit", "offset", "actor", "action", "since", "until"] },
  { method: "GET", path: "/api/analytics", summary: "Aggregate usage report (30 days)", params: [] },
  { method: "GET", path: "/api/analytics/detailed", summary: "Granular analytics with filtering", params: ["days", "eventType", "model", "tool", "deviceId", "limit", "offset"] },
  { method: "POST", path: "/api/analytics/report", summary: "Build a custom analytics report", params: ["days", "include", "model", "tool"] },
  { method: "GET", path: "/api/analytics/trends", summary: "Usage trends, moving average and forecast", params: ["days"] },
  { method: "GET", path: "/api/orgs", summary: "List organizations", params: [] },
  { method: "POST", path: "/api/orgs/create", summary: "Create an organization", params: ["name", "slug", "tier"] },
  { method: "PUT", path: "/api/orgs/:orgId", summary: "Update an organization or its settings", params: ["name", "slug", "tier", "settings"] },
  { method: "DELETE", path: "/api/orgs/:orgId", summary: "Delete an organization", params: [] },
  { method: "GET", path: "/api/users", summary: "List all users", params: [] },
  { method: "POST", path: "/api/users/create", summary: "Create a user", params: ["email", "role", "orgId"] },
  { method: "PUT", path: "/api/users/:userId", summary: "Update a user (role/status/email)", params: ["email", "role", "status"] },
  { method: "DELETE", path: "/api/users/:userId", summary: "Deactivate a user", params: [] },
  { method: "GET", path: "/api/servers", summary: "List connected MCP servers", params: [] },
  { method: "GET", path: "/api/sessions", summary: "List recent agent sessions", params: [] },
  { method: "GET", path: "/api/agents", summary: "List available agents", params: [] },
  { method: "GET", path: "/api/config", summary: "Read masked runtime configuration", params: [] },
  { method: "PUT", path: "/api/config", summary: "Update runtime configuration", params: ["config", "llm"] },
  { method: "GET", path: "/api/config/schema", summary: "Configuration schema and fields", params: [] },
  { method: "GET", path: "/api/config/defaults", summary: "Default configuration values", params: [] },
  { method: "POST", path: "/api/config/validate", summary: "Validate a configuration object", params: ["config"] },
  { method: "GET", path: "/api/notifications", summary: "List notifications", params: ["limit", "offset", "level", "read"] },
  { method: "POST", path: "/api/notifications", summary: "Create a notification", params: ["level", "title", "message", "source"] },
  { method: "PUT", path: "/api/notifications/:id", summary: "Mark a notification read/unread", params: ["read"] },
  { method: "DELETE", path: "/api/notifications/:id", summary: "Delete a notification", params: [] },
  { method: "GET", path: "/api/export/audit", summary: "Export audit logs (CSV/JSON)", params: ["format", "actor", "action", "since", "until", "limit"] },
  { method: "GET", path: "/api/export/analytics", summary: "Export analytics data (CSV/JSON)", params: ["format", "days"] },
  { method: "GET", path: "/api/export/users", summary: "Export users (CSV/JSON)", params: ["format", "role", "status"] },
  { method: "GET", path: "/api/export/config", summary: "Export masked configuration (JSON)", params: [] },
  { method: "GET", path: "/api/exports", summary: "List export history", params: ["limit", "offset"] },
  { method: "POST", path: "/api/exports", summary: "Record an export in history", params: ["source", "format", "filters", "params"] },
  { method: "DELETE", path: "/api/exports/:id", summary: "Delete an export record", params: [] },
  { method: "POST", path: "/api/exports/clear", summary: "Clear export history", params: [] },
  { method: "GET", path: "/api/export-templates", summary: "List export templates", params: [] },
  { method: "POST", path: "/api/export-templates", summary: "Create an export template", params: ["name", "source", "format", "filters", "schedule"] },
  { method: "PUT", path: "/api/export-templates/:id", summary: "Update an export template", params: ["name", "source", "format", "filters", "schedule"] },
  { method: "DELETE", path: "/api/export-templates/:id", summary: "Delete an export template", params: [] },
  { method: "GET", path: "/api/docs/openapi", summary: "OpenAPI 3.0 specification for this dashboard", params: [] },
  { method: "GET", path: "/api/docs/markdown", summary: "Markdown API documentation", params: [] },
  { method: "GET", path: "/api/audit/integrity", summary: "Verify audit log hash-chain integrity", params: [] },
  { method: "GET", path: "/api/audit/compliance", summary: "SOC 2 and GDPR compliance status", params: [] },
  { method: "POST", path: "/api/compliance/report", summary: "Generate a compliance report snapshot", params: [] },
  { method: "GET", path: "/api/security/events", summary: "List security events with filtering", params: ["limit", "offset", "severity", "category", "actor", "since", "until"] },
  { method: "GET", path: "/api/security/stats", summary: "Security event statistics by severity and category", params: [] },
  { method: "GET", path: "/api/security/threats", summary: "Detected security threats from recent events", params: [] },
  { method: "GET", path: "/api/security/alerts", summary: "List security alerts", params: [] },
  { method: "POST", path: "/api/security/alerts", summary: "Create a security alert", params: ["level", "title", "detail"] },
  { method: "POST", path: "/api/security/alerts/:id/resolve", summary: "Resolve a security alert", params: [] },
  { method: "DELETE", path: "/api/security/alerts/:id", summary: "Delete a security alert", params: [] },
  { method: "GET", path: "/api/security/policies", summary: "List security policies", params: [] },
  { method: "PUT", path: "/api/security/policies", summary: "Update a security policy", params: ["key", "enabled", "value"] },
  { method: "GET", path: "/api/security/compliance", summary: "Compliance score and requirement breakdown", params: [] },
  { method: "GET", path: "/api/rbac/roles", summary: "List RBAC roles", params: [] },
  { method: "POST", path: "/api/rbac/roles", summary: "Create an RBAC role", params: ["name", "description", "permissions", "deny", "parentRoleId"] },
  { method: "PUT", path: "/api/rbac/roles/:roleId", summary: "Update an RBAC role", params: ["name", "description", "permissions", "deny", "parentRoleId"] },
  { method: "DELETE", path: "/api/rbac/roles/:roleId", summary: "Delete an RBAC role", params: [] },
  { method: "POST", path: "/api/rbac/roles/:roleId/clone", summary: "Clone an RBAC role under a new name", params: ["name"] },
  { method: "GET", path: "/api/rbac/permissions", summary: "Permission catalog grouped by resource", params: [] },
  { method: "POST", path: "/api/rbac/assign", summary: "Assign a role to a user", params: ["userId", "roleId"] },
  { method: "DELETE", path: "/api/rbac/assign", summary: "Remove a role from a user", params: ["userId", "roleId"] },
  { method: "GET", path: "/api/rbac/users/:userId", summary: "Roles assigned to a user", params: [] },
  { method: "GET", path: "/api/rbac/analytics", summary: "RBAC coverage and assignment analytics", params: [] },
  { method: "GET", path: "/api/rbac/assignments", summary: "All user-role assignments", params: [] },
  { method: "GET", path: "/api/rbac/check", summary: "Test a user's effective permissions", params: ["userId", "permission"] },
];

function buildOpenApiSpec(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const d of API_DESCRIPTIONS) {
    const method = d.method.toLowerCase();
    const parameters = d.params.map((p) => ({
      name: p,
      in: "query",
      required: false,
      schema: { type: "string" },
    }));
    if (!paths[d.path]) paths[d.path] = {};
    (paths[d.path] as Record<string, unknown>)[method] = {
      summary: d.summary,
      parameters,
      responses: { 200: { description: "Successful response" }, 401: { description: "Unauthorized" } },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "MetaTeam Control Plane API",
      description: "HTTP API for the MetaTeam enterprise dashboard.",
      version: "0.1.0",
    },
    servers: [{ url: "/" }],
    paths,
  };
}

function handleOpenApi(): Response {
  return jsonResponse(buildOpenApiSpec());
}

function handleDocsMarkdown(): Response {
  const lines: string[] = [];
  lines.push("# MetaTeam Control Plane API", "", "Authentication is via session cookie set by `POST /api/login`.", "");
  for (const d of API_DESCRIPTIONS) {
    const params = d.params.length ? ` **Params:** ${d.params.join(", ")}` : "";
    lines.push(`- \`${d.method} ${d.path}\` — ${d.summary}.${params}`);
  }
  lines.push("", "Also available as machine-readable spec: `GET /api/docs/openapi`.", "");
  return downloadResponse("text/markdown; charset=utf-8", lines.join("\n"), "mtc-api-docs.md");
}

function handleSecurityEvents(url: URL): Response {
  return jsonResponse({
    events: querySecurityEvents({
      limit: Math.min(Math.max(parseIntParam(url, "limit", 100), 1), 1000),
      offset: Math.max(parseIntParam(url, "offset", 0), 0),
      severity: url.searchParams.get("severity") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      actor: url.searchParams.get("actor") ?? undefined,
      since: url.searchParams.get("since") ?? undefined,
      until: url.searchParams.get("until") ?? undefined,
    }),
    stats: getSecurityEventStats(),
  });
}

function handleComplianceReport(): Response {
  const policies = getSecurityPolicies();
  const compliance = computeComplianceStatus(policies, isTelemetryEnabled());
  const integrity = verifyAuditIntegrity();
  const security = getSecurityEventStats();
  const events = querySecurityEvents({ limit: 100 });
  const threats = detectThreats(events);
  const report = {
    generatedAt: new Date().toISOString(),
    organization: getLicense().organization,
    tier: getLicense().tier,
    score: compliance.score,
    frameworks: compliance.frameworks,
    requirements: compliance.requirements,
    auditIntegrity: integrity,
    securityStats: security,
    activeThreats: threats.map((t) => ({
      category: t.category,
      severity: t.severity,
      eventCount: t.eventCount,
      recommendation: t.recommendation,
    })),
    openAlerts: listSecurityAlerts().filter((a) => a.status === "open").length,
    policies: policies.map((p) => ({ key: p.key, enabled: p.enabled, value: p.value })),
  };
  recordAuditEvent({
    actor: "dashboard",
    action: "compliance.report",
    resource: "compliance",
    detail: "Generated compliance report",
  });
  return jsonResponse(report);
}

async function handleCreateSecurityAlert(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("security.manage");
  if (perm) return perm;

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const level = String(body.level ?? "medium") as SecuritySeverity;
  if (!["info", "low", "medium", "high", "critical"].includes(level)) {
    return jsonResponse({ error: "Level must be one of: info, low, medium, high, critical" }, 400);
  }
  const title = String(body.title ?? "").trim();
  if (!title) return jsonResponse({ error: "Alert title is required" }, 400);
  const alert = createSecurityAlert({ level, title, detail: String(body.detail ?? "") });
  recordAuditEvent({ actor: "dashboard", action: "security.alert.create", resource: `security-alerts/${alert.id}`, detail: `Created ${level} alert: ${title}`, ip });
  return jsonResponse({ alert }, 201);
}

async function handleResolveSecurityAlert(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("security.manage");
  if (perm) return perm;

  const id = decodeURIComponent(url.pathname.slice("/api/security/alerts/".length));
  const alert = resolveSecurityAlert(id);
  if (!alert) return jsonResponse({ error: "Alert not found" }, 404);
  recordAuditEvent({ actor: "dashboard", action: "security.alert.resolve", resource: `security-alerts/${id}`, detail: `Resolved alert: ${alert.title}`, ip });
  return jsonResponse({ alert });
}

async function handleDeleteSecurityAlert(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("security.manage");
  if (perm) return perm;

  const id = decodeURIComponent(url.pathname.slice("/api/security/alerts/".length));
  if (!deleteSecurityAlert(id)) return jsonResponse({ error: "Alert not found" }, 404);
  recordAuditEvent({ actor: "dashboard", action: "security.alert.delete", resource: `security-alerts/${id}`, detail: "Deleted security alert", ip });
  return jsonResponse({ ok: true });
}

async function handleClearSecurityAlerts(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("security.manage");
  if (perm) return perm;

  const count = clearSecurityAlerts();
  recordAuditEvent({ actor: "dashboard", action: "security.alert.clear", resource: "security-alerts", detail: `Cleared ${count} security alerts`, ip });
  return jsonResponse({ cleared: count });
}

async function handleUpdateSecurityPolicy(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("security.manage");
  if (perm) return perm;

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const key = String(body.key ?? "").trim();
  const existing = getSecurityPolicies().find((p) => p.key === key);
  if (!existing) return jsonResponse({ error: `Unknown security policy: ${key}` }, 400);

  const changes: { enabled?: boolean; value?: number | string | boolean } = {};
  if (body.enabled !== undefined) changes.enabled = Boolean(body.enabled);
  if (body.value !== undefined) changes.value = body.value as number | string | boolean;
  const policy = updateSecurityPolicy(key, changes);
  if (!policy) return jsonResponse({ error: "Failed to update policy" }, 400);
  recordAuditEvent({ actor: "dashboard", action: "security.policy.update", resource: `security-policies/${key}`, detail: `Updated policy ${key}`, ip });
  recordSecurityEvent({
    category: "integrity",
    severity: "low",
    actor: "dashboard",
    action: "security.policy.update",
    resource: `security-policies/${key}`,
    detail: `Security policy ${key} changed (enabled=${policy.enabled}, value=${String(policy.value)})`,
    ip,
  });
  return jsonResponse({ policy });
}

async function handleCreateRole(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("rbac.manage");
  if (perm) return perm;

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const result = createRole({
    name: String(body.name ?? ""),
    description: body.description !== undefined ? String(body.description) : undefined,
    permissions: Array.isArray(body.permissions) ? (body.permissions as unknown[]).map(String) : [],
    deny: Array.isArray(body.deny) ? (body.deny as unknown[]).map(String) : [],
    parentRoleId: body.parentRoleId !== undefined && body.parentRoleId !== null ? String(body.parentRoleId) : null,
  });
  if (!result.ok) return jsonResponse({ error: result.error }, 400);
  recordAuditEvent({ actor: "dashboard", action: "rbac.role.create", resource: `rbac-roles/${result.role.id}`, detail: `Created role ${result.role.name}`, ip });
  recordSecurityEvent({
    category: "access",
    severity: "low",
    actor: "dashboard",
    action: "rbac.role.create",
    resource: `rbac-roles/${result.role.id}`,
    detail: `Created RBAC role "${result.role.name}" with ${result.role.permissions.length} permissions`,
    ip,
  });
  return jsonResponse({ role: result.role }, 201);
}

async function handleUpdateRole(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("rbac.manage");
  if (perm) return perm;

  const id = decodeURIComponent(url.pathname.slice("/api/rbac/roles/".length));
  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const result = updateRole(id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    description: body.description !== undefined ? String(body.description) : undefined,
    permissions: body.permissions !== undefined ? (body.permissions as unknown[]).map(String) : undefined,
    deny: body.deny !== undefined ? (body.deny as unknown[]).map(String) : undefined,
    parentRoleId: body.parentRoleId !== undefined ? (body.parentRoleId === null ? null : String(body.parentRoleId)) : undefined,
  });
  if (!result.ok) return jsonResponse({ error: result.error }, 400);
  recordAuditEvent({ actor: "dashboard", action: "rbac.role.update", resource: `rbac-roles/${id}`, detail: `Updated role ${result.role.name}`, ip });
  recordSecurityEvent({
    category: "access",
    severity: "low",
    actor: "dashboard",
    action: "rbac.role.update",
    resource: `rbac-roles/${id}`,
    detail: `Updated RBAC role "${result.role.name}"`,
    ip,
  });
  return jsonResponse({ role: result.role });
}

async function handleDeleteRole(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("rbac.manage");
  if (perm) return perm;

  const id = decodeURIComponent(url.pathname.slice("/api/rbac/roles/".length));
  const result = deleteRole(id);
  if (!result.ok) return jsonResponse({ error: result.error }, 400);
  recordAuditEvent({ actor: "dashboard", action: "rbac.role.delete", resource: `rbac-roles/${id}`, detail: `Deleted role ${result.role.name}`, ip });
  recordSecurityEvent({
    category: "access",
    severity: "low",
    actor: "dashboard",
    action: "rbac.role.delete",
    resource: `rbac-roles/${id}`,
    detail: `Deleted RBAC role "${result.role.name}"`,
    ip,
  });
  return jsonResponse({ ok: true });
}

async function handleCloneRole(req: Request, url: URL): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("rbac.manage");
  if (perm) return perm;

  const match = url.pathname.match(/^\/api\/rbac\/roles\/([^/]+)\/clone$/);
  if (!match) return jsonResponse({ error: "Invalid path" }, 400);
  const id = decodeURIComponent(match[1]);
  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const result = cloneRole(id, String(body.name ?? ""));
  if (!result.ok) return jsonResponse({ error: result.error }, 400);
  recordAuditEvent({ actor: "dashboard", action: "rbac.role.clone", resource: `rbac-roles/${result.role.id}`, detail: `Cloned ${getRole(id)?.name ?? "role"} to ${result.role.name}`, ip });
  recordSecurityEvent({
    category: "access",
    severity: "low",
    actor: "dashboard",
    action: "rbac.role.clone",
    resource: `rbac-roles/${result.role.id}`,
    detail: `Cloned RBAC role to "${result.role.name}"`,
    ip,
  });
  return jsonResponse({ role: result.role }, 201);
}

async function handleAssignRole(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("rbac.manage");
  if (perm) return perm;

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const userId = String(body.userId ?? "").trim();
  const roleId = String(body.roleId ?? "").trim();
  const result = assignRoleToUser(userId, roleId);
  if (!result.ok) return jsonResponse({ error: result.error }, 400);
  recordAuditEvent({ actor: "dashboard", action: "rbac.role.assign", resource: `users/${userId}`, detail: `Assigned role ${result.role.name} to user`, ip });
  recordSecurityEvent({
    category: "access",
    severity: "low",
    actor: "dashboard",
    action: "rbac.role.assign",
    resource: `users/${userId}`,
    detail: `Assigned role "${result.role.name}" to user`,
    ip,
  });
  return jsonResponse({ ok: true });
}

async function handleRemoveRole(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limit = checkMgmtRateLimit(ip);
  if (!limit.allowed) return mgmtRateResponse();
  const perm = requirePermission("rbac.manage");
  if (perm) return perm;

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const userId = String(body.userId ?? "").trim();
  const roleId = String(body.roleId ?? "").trim();
  const removed = removeRoleFromUser(userId, roleId);
  if (!removed) return jsonResponse({ error: "Assignment not found" }, 404);
  recordAuditEvent({ actor: "dashboard", action: "rbac.role.unassign", resource: `users/${userId}`, detail: "Removed role assignment from user", ip });
  recordSecurityEvent({
    category: "access",
    severity: "low",
    actor: "dashboard",
    action: "rbac.role.unassign",
    resource: `users/${userId}`,
    detail: "Removed role assignment from user",
    ip,
  });
  return jsonResponse({ ok: true });
}

function handlePermissionCheck(req: Request): Response {
  const url = new URL(req.url);
  const userId = decodeURIComponent(url.searchParams.get("userId") ?? "");
  const permission = String(url.searchParams.get("permission") ?? "").trim();
  if (!userId) return jsonResponse({ error: "userId is required" }, 400);
  const roles = getUserRoles(userId);
  const effective = resolveEffectivePermissionsForUser(userId);
  const allPermissions = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.key));
  if (permission) {
    if (!allPermissions.includes(permission)) {
      return jsonResponse({ error: `Unknown permission: ${permission}` }, 400);
    }
    return jsonResponse({ allowed: effective.has(permission), permission, effective: [...effective] });
  }
  return jsonResponse({
    userId,
    roles: roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions, deny: r.deny })),
    effectivePermissions: [...effective].sort(),
    totalPermissions: allPermissions.length,
    covered: effective.size,
  });
}

function runScheduledExports(): void {
  const due = dueScheduledTemplates();
  if (due.length === 0) return;
  const now = new Date().toISOString();
  for (const t of due) {
    recordExport({
      source: t.source,
      format: t.format,
      filters: t.filters,
      params: t.filters,
      createdBy: `scheduled:${t.name}`,
    });
    touchTemplateLastRun(t.id, now);
    recordAuditEvent({
      actor: "scheduler",
      action: "export.scheduled",
      resource: `export-templates/${t.id}`,
      detail: `Ran scheduled export "${t.name}" (${t.source}/${t.format})`,
    });
  }
}

export function startDashboard(port: number, host: string = "127.0.0.1"): void {
  if (!DASHBOARD_USER || !DASHBOARD_PASSWORD) {
    console.error("[mc dashboard] MTC_DASHBOARD_USER and MTC_DASHBOARD_PASSWORD must be set");
    return;
  }
  ensureSessionsTable();
  ensureBuiltinRoles();
  console.error(`mtc enterprise dashboard: http://${host}:${port}`);

  Bun.serve({
    port,
    hostname: host,
    websocket: {
      open(ws) {
        ws.subscribe("audit");
        ws.subscribe("license");
        ws.subscribe("sessions");
        ws.subscribe("notify");
        ws.subscribe("health");
        ws.subscribe("status");
        try {
          ws.send(JSON.stringify({ type: "hello", server: "mtc-dashboard" }));
        } catch {
          // socket closed before send
        }
      },
      message(ws, message) {
        const text = typeof message === "string" ? message : Buffer.from(message).toString("utf-8");
        if (text === "ping") {
          try {
            ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          } catch {
            // ignore
          }
          return;
        }
        const parsed = (() => {
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })();
        if (parsed && typeof parsed === "object" && parsed.topic) {
          const topic = String(parsed.topic);
          if (isValidChannel(topic)) {
            try {
              ws.subscribe(topic);
              ws.send(JSON.stringify({ type: "subscribed", topic }));
            } catch {
              // ignore
            }
          }
        }
      },
      close(ws) {
        for (const topic of ["audit", "license", "sessions", "notify", "health", "status"]) {
          try {
            ws.unsubscribe(topic);
          } catch {
            // already closed
          }
        }
      },
    },
    async fetch(req, server) {
      attachRealtimeServer(server);
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/ws") {
        if (!hasValidSession(req)) return jsonResponse({ error: "Unauthorized" }, 401);
        const ok = server.upgrade(req);
        return ok ? undefined : new Response("Upgrade failed", { status: 400 });
      }

      if (path === "/api/login" || path === "/api/logout" || path === "/api/health") {
        cleanupExpiredSessions();
      }

      if (path === "/api/login" && req.method === "POST") {
        return handleLogin(req);
      }
      if (path === "/api/logout" && req.method === "POST") {
        return handleLogout(req);
      }

      if (!hasValidSession(req)) {
        if (path === "/" || path === "/index.html" || path === "/login") {
          return new Response(LOGIN_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        if (path.startsWith("/api/")) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        return new Response("Not found", { status: 404 });
      }

      if (path === "/" || path === "/index.html") {
        return new Response(DASHBOARD_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (path === "/api/status") {
        return jsonResponse(getSystemStatus());
      }

      if (path === "/api/license" && req.method === "GET") {
        return jsonResponse({ license: getLicense(), formatted: formatLicenseInfo(getLicense()) });
      }

      if (path === "/api/license/validate") {
        return handleValidateLicense();
      }

      if (path === "/api/license/activate" && req.method === "POST") {
        return handleActivateLicense(req);
      }

      if (path === "/api/license/deactivate" && req.method === "POST") {
        return handleDeactivateLicense(req);
      }

      if (path === "/api/license/seats" && req.method === "POST") {
        return handleLicenseSeats(req);
      }

      if (path === "/api/audit") {
        const limit = Math.min(Math.max(parseIntParam(url, "limit", 50), 1), 5000);
        const offset = Math.max(parseIntParam(url, "offset", 0), 0);
        const logs = queryAuditLogs({
          limit,
          offset,
          actor: url.searchParams.get("actor") ?? undefined,
          action: url.searchParams.get("action") ?? undefined,
          since: url.searchParams.get("since") ?? undefined,
          until: url.searchParams.get("until") ?? undefined,
        });
        const stats = getAuditStats();
        return jsonResponse({ logs, stats });
      }

      if (path === "/api/orgs" && req.method === "GET") {
        const orgs = listOrganizations();
        return jsonResponse({ organizations: orgs });
      }

      if (path === "/api/orgs/create" && req.method === "POST") {
        return handleCreateOrg(req);
      }

      const orgId = orgIdFromPath(path);
      if (orgId) {
        if (req.method === "PUT") return handleUpdateOrg(req, orgId);
        if (req.method === "DELETE") return handleDeleteOrg(req, orgId);
      }

      if (path === "/api/users" && req.method === "GET") {
        const users = getAllUsers();
        return jsonResponse({ users });
      }

      if (path === "/api/users/create" && req.method === "POST") {
        return handleCreateUser(req);
      }

      const userId = userIdFromPath(path);
      if (userId) {
        if (req.method === "PUT") return handleUpdateUser(req, userId);
        if (req.method === "DELETE") return handleDeleteUser(req, userId);
      }

      if (path === "/api/servers") {
        return jsonResponse({ servers: getConnectedServers() });
      }

      if (path === "/api/sessions") {
        return jsonResponse({ sessions: getActiveSessions() });
      }

      if (path === "/api/notifications" && req.method === "GET") {
        return handleListNotifications(url);
      }
      if (path === "/api/notifications" && req.method === "POST") {
        return handleCreateNotification(req);
      }
      if (path === "/api/notifications/mark-all" && req.method === "POST") {
        return handleMarkAllNotifications(req);
      }
      if (path === "/api/notifications/clear" && req.method === "POST") {
        return handleClearNotifications(req, url);
      }
      if (path === "/api/notifications/preferences" && req.method === "GET") {
        return handleGetNotificationPrefs();
      }
      if (path === "/api/notifications/preferences" && req.method === "PUT") {
        return handleUpdateNotificationPrefs(req);
      }
      if (path.startsWith("/api/notifications/")) {
        if (req.method === "GET") return handleNotificationDetail(url);
        if (req.method === "PUT") return handleUpdateNotification(req, url);
        if (req.method === "DELETE") return handleDeleteNotification(req, url);
      }

      if (path === "/api/config" && req.method === "GET") {
        return handleGetConfig();
      }
      if (path === "/api/config" && req.method === "PUT") {
        return handleUpdateConfig(req);
      }
      if (path === "/api/config/schema") {
        return handleGetConfigSchema();
      }
      if (path === "/api/config/defaults") {
        return handleGetConfigDefaults();
      }
      if (path === "/api/config/validate" && req.method === "POST") {
        return handleValidateConfigRequest(req);
      }

      if (path === "/api/agents") {
        return jsonResponse({ agents: getAllAgents().map((a) => ({ id: a.id, name: a.name, mode: a.mode })) });
      }

      if (path === "/api/analytics") {
        const report = generateReport(30);
        return jsonResponse({ report });
      }

      if (path === "/api/analytics/detailed") {
        return handleAnalyticsDetailed(url);
      }

      if (path === "/api/analytics/report" && req.method === "POST") {
        return handleAnalyticsReport(req);
      }

      if (path === "/api/analytics/trends") {
        return handleAnalyticsTrends(url);
      }

      if (path === "/api/export/audit") {
        return handleExportAudit(url);
      }
      if (path === "/api/export/analytics") {
        return handleExportAnalytics(url);
      }
      if (path === "/api/export/users") {
        return handleExportUsers(url);
      }
      if (path === "/api/export/config") {
        return handleExportConfig();
      }

      if (path === "/api/exports" && req.method === "GET") {
        return handleListExports(url);
      }
      if (path === "/api/exports" && req.method === "POST") {
        return handleRecordExport(req);
      }
      if (path === "/api/exports/clear" && req.method === "POST") {
        return handleClearExports(req);
      }
      if (path.startsWith("/api/exports/") && req.method === "DELETE") {
        return handleDeleteExport(req, url);
      }

      if (path === "/api/export-templates" && req.method === "GET") {
        return handleListTemplates();
      }
      if (path === "/api/export-templates" && req.method === "POST") {
        return handleCreateTemplate(req);
      }
      if (path.startsWith("/api/export-templates/")) {
        if (req.method === "PUT") return handleUpdateTemplate(req, url);
        if (req.method === "DELETE") return handleDeleteTemplate(req, url);
      }

      if (path === "/api/docs/openapi") {
        return handleOpenApi();
      }
      if (path === "/api/docs/markdown") {
        return handleDocsMarkdown();
      }

      if (path === "/api/audit/integrity") {
        return jsonResponse(verifyAuditIntegrity());
      }
      if (path === "/api/audit/compliance") {
        return jsonResponse(computeComplianceStatus(getSecurityPolicies(), isTelemetryEnabled()));
      }

      if (path === "/api/security/events") {
        return handleSecurityEvents(url);
      }
      if (path === "/api/security/stats") {
        return jsonResponse(getSecurityEventStats());
      }
      if (path === "/api/security/threats") {
        const events = querySecurityEvents({ limit: 5000 });
        return jsonResponse({ threats: detectThreats(events), eventCount: events.length });
      }
      if (path === "/api/security/alerts" && req.method === "GET") {
        return jsonResponse({ alerts: listSecurityAlerts() });
      }
      if (path === "/api/security/alerts" && req.method === "POST") {
        return handleCreateSecurityAlert(req);
      }
      if (path === "/api/security/alerts/clear" && req.method === "POST") {
        return handleClearSecurityAlerts(req);
      }
      if (path.startsWith("/api/security/alerts/") && req.method === "POST") {
        return handleResolveSecurityAlert(req, url);
      }
      if (path.startsWith("/api/security/alerts/") && req.method === "DELETE") {
        return handleDeleteSecurityAlert(req, url);
      }
      if (path === "/api/security/policies" && req.method === "GET") {
        return jsonResponse({ policies: getSecurityPolicies() });
      }
      if (path === "/api/security/policies" && req.method === "PUT") {
        return handleUpdateSecurityPolicy(req);
      }
      if (path === "/api/security/compliance") {
        return jsonResponse(computeComplianceStatus(getSecurityPolicies(), isTelemetryEnabled()));
      }
      if (path === "/api/compliance/report" && req.method === "POST") {
        return handleComplianceReport();
      }

      if (path === "/api/rbac/roles" && req.method === "GET") {
        return jsonResponse({ roles: listRoles() });
      }
      if (path === "/api/rbac/roles" && req.method === "POST") {
        return handleCreateRole(req);
      }
      if (path === "/api/rbac/permissions") {
        return jsonResponse({ groups: PERMISSION_CATALOG });
      }
      if (path === "/api/rbac/analytics") {
        return jsonResponse(getRbacAnalytics());
      }
      if (path === "/api/rbac/assignments") {
        return jsonResponse({ assignments: listRoleAssignments() });
      }
      if (path === "/api/rbac/check") {
        return handlePermissionCheck(req);
      }
      if (path === "/api/rbac/assign" && req.method === "POST") {
        return handleAssignRole(req);
      }
      if (path === "/api/rbac/assign" && req.method === "DELETE") {
        return handleRemoveRole(req);
      }
      if (path.startsWith("/api/rbac/roles/")) {
        if (req.method === "PUT") return handleUpdateRole(req, url);
        if (req.method === "DELETE") return handleDeleteRole(req, url);
        if (req.method === "POST" && path.endsWith("/clone")) return handleCloneRole(req, url);
      }
      if (path.startsWith("/api/rbac/users/")) {
        const userId = decodeURIComponent(path.slice("/api/rbac/users/".length));
        if (req.method === "GET") return jsonResponse({ roles: getUserRoles(userId) });
      }

      if (path === "/api/health") {
        return jsonResponse({ status: "ok", timestamp: new Date().toISOString(), telemetry: isTelemetryEnabled() });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  setInterval(() => {
    broadcastHealth({
      status: "ok",
      timestamp: new Date().toISOString(),
      sessions: getActiveSessions().length,
      telemetry: isTelemetryEnabled(),
    });
  }, 30000);

  setInterval(() => {
    runScheduledExports();
  }, 15 * 60 * 1000);
}

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>Sign in — MetaTeam Control Plane</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0a0c12;
    --surface: #12151e;
    --surface-2: #1a1e2a;
    --border: rgba(148, 163, 255, 0.08);
    --text: #e9ebf4;
    --text-muted: #9ba3bb;
    --accent: #6c7bff;
    --red: #f87171;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(1000px 500px at 50% -20%, rgba(108,123,255,0.12), transparent 60%), var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 360px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
  }
  .brand-mark {
    width: 40px; height: 40px; border-radius: 11px;
    background: linear-gradient(135deg, #6c7bff, #9a5bff);
    color: #fff; font-weight: 700; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(108, 123, 255, 0.35);
    margin-bottom: 18px;
  }
  h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
  .sub { color: var(--text-muted); font-size: 13px; margin: 6px 0 24px; }
  label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
  input {
    width: 100%; padding: 10px 12px; margin-bottom: 16px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-size: 14px;
    font-family: inherit; outline: none;
  }
  input:focus { border-color: rgba(108,123,255,0.5); }
  button {
    width: 100%; padding: 10px 12px; margin-top: 4px;
    background: var(--accent); border: none; border-radius: 8px;
    color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: inherit;
  }
  button:hover { filter: brightness(1.1); }
  button:disabled { opacity: 0.6; cursor: default; }
  .error {
    margin-top: 14px; padding: 10px 12px;
    border: 1px solid rgba(248,113,113,0.3); background: rgba(248,113,113,0.08);
    color: var(--red); border-radius: 8px; font-size: 13px;
    display: none;
  }
</style>
</head>
<body>
<div class="card">
  <div class="brand-mark">M</div>
  <h1>MetaTeam Control Plane</h1>
  <div class="sub">Sign in to access the dashboard</div>
  <form id="loginForm">
    <label for="username">Username</label>
    <input id="username" name="username" type="text" autocomplete="username" required autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit" id="submitBtn">Sign in</button>
    <div class="error" id="error"></div>
  </form>
</div>
<script>
(function () {
  var form = document.getElementById('loginForm');
  var error = document.getElementById('error');
  var btn = document.getElementById('submitBtn');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    error.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in\u2026';
    try {
      var res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        })
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      var data = await res.json().catch(function () { return {}; });
      error.textContent = data.error || 'Sign in failed';
      error.style.display = 'block';
    } catch (err) {
      error.textContent = 'Network error: ' + err.message;
      error.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
})();
</script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>MetaTeam Control Plane</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0c12;
    --surface: #12151e;
    --surface-2: #1a1e2a;
    --surface-3: #242a3a;
    --border: rgba(148, 163, 255, 0.08);
    --text: #e9ebf4;
    --text-muted: #9ba3bb;
    --text-faint: #6b7388;
    --accent: #6c7bff;
    --accent-soft: rgba(108, 123, 255, 0.12);
    --green: #34d399;
    --yellow: #fbbf24;
    --red: #f87171;
    --blue: #60a5fa;
    --purple: #a78bfa;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scrollbar-color: var(--surface-3) transparent; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 85% -10%, rgba(108,123,255,0.07), transparent 60%), var(--bg);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 6px; border: 2px solid var(--bg); }
  ::-webkit-scrollbar-track { background: transparent; }
  .layout { display: grid; grid-template-columns: 264px 1fr; min-height: 100vh; }

  /* Sidebar */
  .sidebar {
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .brand { display: flex; align-items: center; gap: 12px; padding: 4px 8px 24px; }
  .brand-mark {
    width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, #6c7bff, #9a5bff);
    color: #fff; font-weight: 700; font-size: 15px; letter-spacing: -0.5px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(108, 123, 255, 0.35);
  }
  .brand-name { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; }
  .brand-sub { font-size: 11px; color: var(--text-muted); }
  .nav-group-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-faint); margin: 18px 8px 6px; font-weight: 600; }
  .nav { list-style: none; }
  .nav li {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 500; color: var(--text-muted);
    margin-bottom: 2px; transition: background 0.15s, color 0.15s;
    user-select: none;
  }
  .nav li svg { opacity: 0.65; flex-shrink: 0; }
  .nav li:hover { background: var(--surface-2); color: var(--text); }
  .nav li:hover svg { opacity: 0.9; }
  .nav li.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .nav li.active svg { opacity: 1; }
  .nav-badge {
    margin-left: auto; background: var(--red); color: #fff; font-size: 10px; font-weight: 700;
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .sidebar-foot { margin-top: auto; padding: 16px 8px 4px; border-top: 1px solid var(--border); }
  .sidebar-foot .nav-group-label { margin: 0 0 6px; }
  .sys-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); padding: 4px 0; }

  /* Mobile nav */
  .mobile-nav {
    display: none; align-items: center; gap: 10px;
    position: sticky; top: 0; z-index: 10;
    background: rgba(18, 21, 30, 0.9); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border); padding: 10px 16px;
  }
  .mobile-nav .brand-mark { width: 28px; height: 28px; border-radius: 8px; font-size: 12px; box-shadow: none; }
  .mobile-nav .nav { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .mobile-nav .nav::-webkit-scrollbar { display: none; }
  .mobile-nav .nav li { margin: 0; white-space: nowrap; padding: 7px 12px; }

  /* Main */
  .main { padding: 32px 40px; overflow-y: auto; width: 100%; max-width: 1240px; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 28px; }
  .page-header h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .page-header .sub { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
  .header-badge { padding-top: 4px; flex-shrink: 0; }

  /* Badges */
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 600; border: 1px solid transparent;
  }
  .badge.community { background: rgba(155, 163, 187, 0.1); color: var(--text-muted); border-color: rgba(155, 163, 187, 0.2); }
  .badge.enterprise { background: rgba(96, 165, 250, 0.12); color: var(--blue); border-color: rgba(96, 165, 250, 0.25); }
  .badge.enterprise-plus { background: rgba(167, 139, 250, 0.12); color: var(--purple); border-color: rgba(167, 139, 250, 0.25); }
  .badge.tier { text-transform: capitalize; }

  /* Stat cards */
  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(235px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 18px; display: flex; flex-direction: column; gap: 10px;
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .stat:hover { border-color: rgba(148, 163, 255, 0.22); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); }
  .stat-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .stat-icon svg { width: 18px; height: 18px; }
  .chip-accent { color: var(--accent); background: rgba(108, 123, 255, 0.12); }
  .chip-green { color: var(--green); background: rgba(52, 211, 153, 0.12); }
  .chip-blue { color: var(--blue); background: rgba(96, 165, 250, 0.12); }
  .chip-yellow { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
  .chip-red { color: var(--red); background: rgba(248, 113, 113, 0.12); }
  .chip-purple { color: var(--purple); background: rgba(167, 139, 250, 0.12); }
  .stat-label { font-size: 12px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.6px; }
  .stat-value {
    font-size: 26px; font-weight: 700; letter-spacing: -0.5px;
    font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Sections */
  .section { margin-bottom: 32px; }
  .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .section-head h3 { font-size: 14px; font-weight: 600; letter-spacing: -0.2px; }
  .section-head .count { font-size: 12px; color: var(--text-faint); font-weight: 500; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  .panel.pad { padding: 16px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left; padding: 12px 16px; font-size: 11px; font-weight: 600;
    color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px;
    border-bottom: 1px solid var(--border); background: var(--surface-2);
  }
  td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid var(--border); color: var(--text); }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr { transition: background 0.12s; }
  tbody tr:hover td { background: rgba(148, 163, 255, 0.045); }

  /* Bits */
  .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  .dim { color: var(--text-muted); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
  .pill {
    display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 500; background: var(--surface-3); color: var(--text);
    white-space: nowrap;
  }
  .pill-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .status { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
  .status::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); flex-shrink: 0; }
  .status.ok::before { background: var(--green); box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.15); }
  .status.warn::before { background: var(--yellow); }
  .status.bad::before { background: var(--red); }

  /* Feature grid */
  .feature-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .feature-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; font-size: 13px;
  }
  .feature-item .icon { display: flex; align-items: center; flex-shrink: 0; }
  .feature-item .icon svg { width: 16px; height: 16px; }
  .feature-item .tier { margin-left: auto; font-size: 11px; color: var(--text-faint); font-weight: 500; text-transform: capitalize; }

  /* License box */
  .license-box {
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
    padding: 18px 20px; font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; color: var(--text);
  }

  /* Toolbar + forms */
  .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .toolbar .search { flex: 1; min-width: 200px; }
  input, select {
    padding: 9px 12px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-size: 13px; font-family: inherit; outline: none;
  }
  input:focus, select:focus { border-color: rgba(108,123,255,0.5); }
  textarea {
    width: 100%; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-size: 13px; font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
    outline: none; resize: vertical; min-height: 64px;
  }
  textarea:focus { border-color: rgba(108,123,255,0.5); }
  .license-input { font-size: 12.5px; word-break: break-all; }
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 14px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--surface-2); color: var(--text); font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: background 0.15s, border-color 0.15s;
  }
  .btn:hover { background: var(--surface-3); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
  .btn.primary:hover { filter: brightness(1.1); }
  .btn.ghost { background: transparent; }
  .btn.danger { color: var(--red); border-color: rgba(248,113,113,0.3); }
  .btn.danger:hover { background: rgba(248,113,113,0.1); }
  .btn.tiny { padding: 4px 9px; font-size: 12px; }
  .row-actions { display: flex; gap: 6px; }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
  .form-grid label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
  .form-grid input, .form-grid select { width: 100%; }
  .form-actions { margin-top: 14px; }
  .toast {
    position: fixed; bottom: 20px; right: 20px; z-index: 100;
    padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
    background: var(--surface-3); border: 1px solid var(--border); color: var(--text);
    box-shadow: 0 8px 24px rgba(0,0,0,0.3); opacity: 0; transform: translateY(8px);
    transition: opacity 0.2s, transform 0.2s;
  }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast.error { color: var(--red); border-color: rgba(248,113,113,0.4); }

  .empty { padding: 28px; text-align: center; color: var(--text-muted); font-size: 13px; }
  .loading { display: flex; align-items: center; justify-content: center; min-height: 60vh; color: var(--text-muted); font-size: 14px; gap: 12px; }
  .loading::before {
    content: ''; width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid var(--surface-3); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { margin: 40px auto; max-width: 520px; padding: 18px 20px; border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.08); color: var(--red); border-radius: 12px; font-size: 13px; }

  /* Charts */
  .chart { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
  .chart-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .chart-head h3 { font-size: 14px; font-weight: 600; letter-spacing: -0.2px; }
  .chart svg { width: 100%; height: auto; }
  .chart .legend { display: flex; gap: 14px; font-size: 12px; color: var(--text-muted); margin-bottom: 10px; flex-wrap: wrap; }
  .chart .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .chart .legend .dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
  .range-btn { border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .range-btn.active { background: var(--accent); border-color: transparent; color: #fff; }
  .range-btn:hover:not(.active) { background: var(--surface-3); }

  .rec-list { display: flex; flex-direction: column; gap: 10px; }
  .rec-item { display: flex; gap: 10px; padding: 12px 14px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; font-size: 13px; line-height: 1.5; }
  .rec-item .rec-icon { color: var(--yellow); flex-shrink: 0; }
  .rec-item.warn .rec-icon { color: var(--red); }

  .compare { display: flex; gap: 14px; flex-wrap: wrap; }
  .compare .cmp-box { flex: 1; min-width: 130px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .compare .cmp-box .label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px; }
  .compare .cmp-box .val { font-size: 18px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .delta-up { color: var(--green); }
  .delta-down { color: var(--red); }

  .report-builder .builder-opts { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
  .report-builder label.opt { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-muted); cursor: pointer; padding: 6px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; }
  .report-builder label.opt input { accent-color: var(--accent); }
  .report-output { margin-top: 12px; max-height: 420px; overflow: auto; background: #0d0f16; border: 1px solid var(--border); border-radius: 10px; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; white-space: pre-wrap; color: var(--text); }

  .api-layout { display: grid; grid-template-columns: 300px 1fr; gap: 18px; }
  .api-endpoints { max-height: 70vh; overflow-y: auto; }
  .api-endpoints .ep { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 8px; cursor: pointer; font-size: 12.5px; color: var(--text-muted); margin-bottom: 2px; }
  .api-endpoints .ep:hover { background: var(--surface-2); color: var(--text); }
  .api-endpoints .ep.active { background: var(--accent-soft); color: var(--text); }
  .ep-method { font-size: 10px; font-weight: 700; width: 44px; flex-shrink: 0; text-align: center; padding: 2px 0; border-radius: 5px; }
  .ep-method.get { color: var(--green); background: rgba(52, 211, 153, 0.12); }
  .ep-method.post { color: var(--blue); background: rgba(96, 165, 250, 0.12); }
  .ep-method.put { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
  .ep-method.delete { color: var(--red); background: rgba(248, 113, 113, 0.12); }
  .api-console .mono-path { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .kv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { display: none; }
    .mobile-nav { display: flex; }
    .main { padding: 20px 16px; }
    .page-header { flex-direction: column; gap: 12px; }
    .api-layout { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">M</div>
      <div>
        <div class="brand-name">MetaTeam</div>
        <div class="brand-sub">Control Plane</div>
      </div>
    </div>
    <div class="nav-group-label">Console</div>
    <ul class="nav">
      <li class="active" data-view="overview">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span>Overview</span>
      </li>
      <li data-view="license">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>
        <span>License</span>
      </li>
      <li data-view="audit">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        <span>Audit Logs</span>
      </li>
      <li data-view="analytics">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15v-4M12 15V7M17 15v-7"/></svg>
        <span>Analytics</span>
      </li>
      <li data-view="config">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="7" cy="17" r="2" fill="var(--surface)"/></svg>
        <span>Configuration</span>
      </li>
      <li data-view="organizations">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M10 22v-6h4v6"/><path d="M3 22h18"/></svg>
        <span>Organizations</span>
      </li>
      <li data-view="users">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5 6.5-5s6 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M19 15c1.5.5 2.5 2 2.5 5"/></svg>
        <span>Users</span>
      </li>
      <li data-view="sessions">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>
        <span>Sessions</span>
      </li>
      <li data-view="notifications">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        <span>Notifications</span>
        <span id="notifBadge" class="nav-badge" style="display:none"></span>
      </li>
      <li data-view="servers">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>
        <span>Connections</span>
      </li>
      <li data-view="exports">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
        <span>Exports</span>
      </li>
      <li data-view="apidocs">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 13l-2 2 2 2M14 17h3"/></svg>
        <span>API Docs</span>
      </li>
      <li data-view="security">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
        <span>Security</span>
      </li>
      <li data-view="compliance">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l3 3v15H6V6z"/><path d="M9 3v3h6M9 12l2 2 4-4"/></svg>
        <span>Compliance</span>
      </li>
      <li data-view="rbac">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Access Control</span>
      </li>
    </ul>
    <div class="sidebar-foot">
      <div class="nav-group-label">System</div>
      <div class="sys-item"><span class="status ok"></span>All systems operational</div>
    </div>
  </aside>
  <div class="mobile-nav" id="mobileNav">
    <div class="brand-mark">M</div>
  </div>
  <main class="main" id="content">
    <div class="loading">Loading&hellip;</div>
  </main>
</div>

<script>
const API = '/api';
const IC = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>',
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-6 6 6 6 0 0 1-6-6z"/><path d="M12 18v4"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5 6.5-5s6 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M19 15c1.5.5 2.5 2 2.5 5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M10 22v-6h4v6"/><path d="M3 22h18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5l6 6-6 6M12 19h8"/></svg>',
  coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><circle cx="15.5" cy="14.5" r="6"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
};

let state = { status: null, license: null, audit: null, analytics: null, orgs: null, servers: null, agents: null, users: null, config: null, sessions: null, notifications: null, exports: null, templates: null, security: null, alerts: null, policies: null, compliance: null, rbacRoles: null, rbacPermissions: null, rbacAnalytics: null, rbacAssignments: null };

let auditActorFilter = '';
let auditActionFilter = '';
let auditSinceFilter = '';
let auditUntilFilter = '';

/* ---- helpers ---- */
function stat(label, value, chip, icon) {
  return '<div class="stat">' +
    '<div class="stat-icon ' + chip + '">' + (icon || '') + '</div>' +
    '<div class="stat-label">' + label + '</div>' +
    '<div class="stat-value">' + esc(value) + '</div>' +
    '</div>';
}
function stats(items) { return '<div class="stats">' + items.join('') + '</div>'; }

function pageHeader(title, sub, badge) {
  return '<div class="page-header"><div>' +
    '<h2>' + title + '</h2>' +
    (sub ? '<div class="sub">' + sub + '</div>' : '') +
    '</div>' +
    (badge ? '<div class="header-badge">' + badge + '</div>' : '') +
    '</div>';
}

function section(title, count, inner, pad) {
  return '<div class="section">' +
    '<div class="section-head"><h3>' + title + '</h3>' +
    (count != null ? '<span class="count">' + count + '</span>' : '') +
    '</div>' +
    '<div class="panel' + (pad ? ' pad' : '') + '">' + inner + '</div>' +
    '</div>';
}

function table(headers, rows) {
  return '<table><thead><tr>' +
    headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('') +
    '</tbody></table>';
}

function tierBadge(tier) {
  return '<span class="badge tier ' + esc(tier) + '">' + esc(tier) + '</span>';
}

function featureGrid(features) {
  if (!features || !features.length) return '<div class="empty">No features available.</div>';
  return '<div class="feature-grid">' + features.map(function (f) {
    var ok = !!f.available;
    return '<div class="feature-item">' +
      '<span class="icon" style="color:' + (ok ? 'var(--green)' : 'var(--text-faint)') + '">' + (ok ? IC.check : IC.x) + '</span>' +
      '<span>' + esc(f.feature.replace(/_/g, ' ')) + '</span>' +
      '<span class="tier">' + esc(f.tier) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

function pillList(items) {
  if (!items || !items.length) return '<div class="empty">No enterprise features (community tier).</div>';
  return '<div class="pill-list">' + items.map(function (i) {
    return '<span class="pill">' + esc(i.replace(/_/g, ' ')) + '</span>';
  }).join('') + '</div>';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
  });
}

/* ---- charts ---- */
function barChart(labels, values, color) {
  if (!values || !values.length) return '<div class="empty">No data.</div>';
  const w = 560, h = 120, pad = 14;
  const max = Math.max.apply(null, values.concat([1]));
  const bw = w / values.length;
  let bars = '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i] || 0;
    const bh = Math.max(2, (v / max) * (h - pad));
    const x = (i * bw + bw * 0.18).toFixed(1);
    const y = (h - pad - bh + 2).toFixed(1);
    const width = Math.max(2, bw * 0.64).toFixed(1);
    bars += '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + (color || 'var(--accent)') + '" opacity="0.85">' +
      '<title>' + esc(labels[i] || '') + ': ' + esc(v) + '</title></rect>';
  }
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<line x1="0" y1="' + (h - pad) + '" x2="' + w + '" y2="' + (h - pad) + '" stroke="var(--border)" stroke-width="1"/>' + bars + '</svg>';
}

function lineChart(series, height) {
  const hasData = series.some(function (s) { return s.values.length > 0; });
  if (!hasData) return '<div class="empty">No data.</div>';
  const w = 600, h = height || 160, pad = 14;
  let allValues = [];
  series.forEach(function (s) { allValues = allValues.concat(s.values); });
  const max = Math.max.apply(null, allValues.concat([1]));
  const n = Math.max.apply(null, series.map(function (s) { return s.values.length; }));
  function points(values) {
    return values.map(function (v, i) {
      const x = (pad + (i / Math.max(n - 1, 1)) * (w - pad * 2)).toFixed(1);
      const y = (pad + (1 - (v || 0) / max) * (h - pad * 2)).toFixed(1);
      return x + ',' + y;
    }).join(' ');
  }
  let out = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">';
  out += '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="var(--border)" stroke-width="1"/>';
  series.forEach(function (s) {
    if (!s.values.length) return;
    out += '<polyline points="' + points(s.values) + '" fill="none" stroke="' + (s.color || 'var(--accent)') + '" stroke-width="1.8"' + (s.dashed ? ' stroke-dasharray="5 4"' : '') + ' opacity="0.9"/>';
  });
  out += '</svg>';
  return out;
}

function chartLegend(items) {
  return '<div class="legend">' + items.map(function (it) {
    return '<span><span class="dot" style="background:' + it.color + '"></span>' + esc(it.name) + '</span>';
  }).join('') + '</div>';
}

function chartBox(title, inner, extra) {
  return '<div class="chart"><div class="chart-head"><h3>' + title + '</h3>' + (extra || '') + '</div>' + inner + '</div>';
}

function fmtCost(value) {
  return '$' + (value || 0).toFixed(2);
}

function pct(value) {
  return (value || 0) + '%';
}

/* ---- views ---- */
function renderOverview() {
  const s = state.status;
  if (!s) return '<div class="loading">Loading&hellip;</div>';
  const n = state.agents && state.agents.agents ? state.agents.agents.length : 0;
  const avail = s.features ? s.features.filter(f => f.available).length : 0;
  const total = s.features ? s.features.length : 0;
  return pageHeader('Overview', 'System health and feature availability', tierBadge(s.tier)) +
    stats([
      stat('License Status', s.licenseStatus, s.licenseStatus === 'active' ? 'chip-green' : 'chip-red', s.licenseStatus === 'active' ? IC.check : IC.x),
      stat('MCP Connections', s.connectedMcpServers, 'chip-blue', IC.plug),
      stat('Active Agents', n, 'chip-accent', IC.cpu),
      stat('Features Available', avail + ' / ' + total, 'chip-green', IC.check)
    ]) +
    section('Feature Availability', total + ' features', featureGrid(s.features), true);
}

function renderLicense() {
  const l = state.license;
  if (!l) return '<div class="loading">Loading&hellip;</div>';
  const lic = l.license;
  const feats = lic.features || [];
  const isCommunity = lic.tier === 'community';
  const daysLeft = lic.expiresAt ? Math.max(0, Math.floor((new Date(lic.expiresAt).getTime() - Date.now()) / 86400000)) : null;
  let html = pageHeader('License', 'Enterprise licensing details', tierBadge(lic.tier)) +
    stats([
      stat('Status', lic.status, lic.status === 'active' ? 'chip-green' : 'chip-red', lic.status === 'active' ? IC.check : IC.x),
      stat('Seats', lic.currentSeats + ' / ' + lic.maxSeats, 'chip-blue', IC.users),
      stat('Expires', lic.expiresAt ? lic.expiresAt.slice(0, 10) : 'N/A', lic.status === 'active' && daysLeft !== null && daysLeft < 30 ? 'chip-red' : 'chip-yellow', IC.clock),
      stat('Organization', lic.organization, 'chip-purple', IC.building)
    ]);

  if (daysLeft !== null && daysLeft < 30 && !isCommunity) {
    html += '<div class="error" style="margin-bottom:16px">Warning: this license expires in ' + daysLeft + ' day(s). Contact your vendor to renew.</div>';
  }

  if (isCommunity) {
    html += section('Activate License', null,
      '<form data-form="license-activate">' +
      '<p class="dim" style="margin-bottom:12px;display:block">Paste your enterprise license key to activate team features.</p>' +
      '<textarea name="key" class="license-input" placeholder="MTC-enterprise-..."></textarea>' +
      '<div class="form-actions"><button type="submit" class="btn primary">Activate license</button></div>' +
      '<div class="error" data-form-error style="display:none"></div>' +
      '</form>', true);
  } else {
    html += section('License Actions', null,
      '<div class="toolbar" style="margin-bottom:0">' +
      '<button class="btn" data-action="license-validate">Re-validate</button>' +
      '<form data-form="license-seats" class="seats-form" style="display:flex;gap:8px;align-items:center">' +
      '<label style="font-size:12px;color:var(--text-muted)">Seats</label>' +
      '<input name="maxSeats" type="number" min="1" value="' + esc(lic.maxSeats) + '" style="width:90px">' +
      '<button type="submit" class="btn">Update</button></form>' +
      '<button class="btn danger" data-action="license-deactivate">Deactivate license</button>' +
      '</div>', true);
  }

  html += section('License Details', null, '<div class="license-box">' + esc(l.formatted) + '</div>', true) +
    section('Enterprise Features', feats.length + ' features', pillList(feats), true);
  return html;
}

function renderAudit() {
  const a = state.audit;
  if (!a) return '<div class="loading">Loading&hellip;</div>';
  const statsData = a.stats || {};
  const logs = a.logs || [];
  let html = pageHeader('Audit Logs', 'Security and activity trail');
  html += stats([
    stat('Total Events', statsData.total || 0, 'chip-blue', IC.file),
    stat('Unique Actors', statsData.uniqueActors || 0, 'chip-accent', IC.users)
  ]);
  if (statsData.topActions && statsData.topActions.length) {
    html += section('Top Actions', statsData.topActions.length + ' actions',
      table(['Action', 'Count'], statsData.topActions.map(act => [esc(act.action), '<span class="mono">' + esc(act.count) + '</span>'])));
  }
  html += section('Filters', null,
    '<form data-form="audit-filter" class="toolbar" style="gap:8px;margin-bottom:4px">' +
    '<input name="actor" placeholder="Actor" value="' + esc(auditActorFilter) + '" style="width:160px">' +
    '<input name="action" placeholder="Action" value="' + esc(auditActionFilter) + '" style="width:180px">' +
    '<input name="since" type="date" value="' + esc(auditSinceFilter) + '" title="Since">' +
    '<input name="until" type="date" value="' + esc(auditUntilFilter) + '" title="Until">' +
    '<button type="submit" class="btn primary">Apply</button>' +
    '<button type="button" class="btn ghost" data-action="audit-filter-clear">Clear</button>' +
    '<span class="dim" style="font-size:12px;margin-left:auto">' + logs.length + ' shown</span>' +
    '</form>', false);
  html += section('Recent Events', logs.length + ' events',
    logs.length
      ? table(['Time', 'Actor', 'Action', 'Resource', 'Detail'], logs.map(log => [
          '<span class="mono">' + esc(new Date(log.timestamp).toLocaleString()) + '</span>',
          esc(log.actor),
          '<span class="pill">' + esc(log.action) + '</span>',
          esc(log.resource),
          '<span class="dim">' + esc(log.detail) + '</span>'
        ]))
      : '<div class="empty">No audit events recorded yet.</div>');
  return html;
}

let analyticsDays = 30;
let reportInclude = ['summary', 'models', 'tools', 'performance', 'trends', 'cost'];
let reportResult = null;

async function loadAnalytics() {
  try {
    const [detailed, trends] = await Promise.all([
      fetchJSON(API + '/analytics/detailed?days=' + analyticsDays),
      fetchJSON(API + '/analytics/trends?days=' + analyticsDays)
    ]);
    state.analyticsDetailed = detailed;
    state.analyticsTrends = trends;
  } catch (err) {
    state.analyticsDetailed = null;
    state.analyticsTrends = null;
  }
  if (getActiveView() === 'analytics') renderView('analytics');
}

function renderAnalytics() {
  const d = state.analyticsDetailed;
  const t = state.analyticsTrends;
  if (!d) return '<div class="loading">Loading&hellip;</div>';
  const s = d.summary || {};
  const modelStats = d.modelStats || [];
  const toolStats = d.toolStats || [];
  const costs = d.costs || { perModel: [], totalCost: 0 };
  const recs = d.recommendations || [];
  const modelsPerf = d.modelPerformance || [];
  const toolsPerf = d.toolPerformance || [];
  const eventTypes = d.eventTypes || [];

  const rangeSel = '<div style="display:flex;gap:6px">' + [7, 14, 30, 90].map(function (n) {
    return '<button class="range-btn' + (analyticsDays === n ? ' active' : '') + '" data-range="' + n + '">' + n + 'd</button>';
  }).join('') + '</div>';

  let html = pageHeader('Analytics', 'Usage, performance, and cost insights', rangeSel);

  html += stats([
    stat('Sessions', s.totalSessions || 0, 'chip-blue', IC.play),
    stat('Tool Calls', s.totalToolCalls || 0, 'chip-accent', IC.terminal),
    stat('Total Tokens', (s.totalTokens || 0).toLocaleString(), 'chip-yellow', IC.coins),
    stat('Estimated Cost', fmtCost(costs.totalCost), 'chip-green', IC.coins),
    stat('Active Devices', s.activeDevices || 0, 'chip-green', IC.monitor)
  ]);

  if (t) {
    const dates = t.dates || [];
    const cmp = t.comparison || {};
    const cmpPct = cmp.deltaPct || 0;
    const cmpClass = cmpPct >= 0 ? 'delta-up' : 'delta-down';
    const cmpArrow = cmpPct >= 0 ? '\u2191' : '\u2193';
    html += chartBox('Daily Activity with Forecast',
      chartLegend([
        { name: 'Tool calls', color: 'var(--accent)' },
        { name: '7-day avg', color: 'var(--green)' },
        { name: 'Forecast', color: 'var(--yellow)' }
      ]) + lineChart([
        { name: 'calls', color: 'var(--accent)', values: t.calls || [] },
        { name: 'avg', color: 'var(--green)', values: t.movingAverage || [] },
        { name: 'forecast', color: 'var(--yellow)', dashed: true, values: t.forecast && t.forecast.calls ? t.forecast.calls : [] }
      ], 170)) +
      '<div class="chart"><div class="chart-head"><h3>Period Comparison</h3></div>' +
      '<div class="compare">' +
      '<div class="cmp-box"><div class="label">Current half</div><div class="val">' + esc((cmp.currentTotal || 0).toLocaleString()) + ' calls</div></div>' +
      '<div class="cmp-box"><div class="label">Previous half</div><div class="val">' + esc((cmp.previousTotal || 0).toLocaleString()) + ' calls</div></div>' +
      '<div class="cmp-box"><div class="label">Delta</div><div class="val ' + cmpClass + '">' + cmpArrow + ' ' + esc(Math.abs(cmpPct)) + '%</div></div>' +
      '</div></div>';
  }

  if (modelStats.length) {
    html += chartBox('Tokens by Model',
      barChart(modelStats.map(m => m.model), modelStats.map(m => m.total_tokens || 0), 'var(--blue)')) +
      section('Model Usage', modelStats.length + ' models',
        table(['Model', 'Tokens', 'Calls', 'Est. Cost'], modelStats.map(m => {
          const row = costs.perModel.find(c => c.model === m.model);
          return [
            esc(m.model),
            '<span class="mono">' + esc((m.total_tokens || 0).toLocaleString()) + '</span>',
            '<span class="mono">' + esc(m.call_count || 0) + '</span>',
            '<span class="mono">' + fmtCost(row ? row.cost : 0) + '</span>'
          ];
        })));
  }

  if (toolStats.length) {
    html += chartBox('Tool Usage',
      barChart(toolStats.map(t => t.tool_name), toolStats.map(t => t.call_count || 0), 'var(--purple)')) +
      section('Tool Usage', toolStats.length + ' tools',
        table(['Tool', 'Calls', 'Success Rate', 'Avg Duration'], toolStats.map(t => [
          esc(t.tool_name),
          '<span class="mono">' + esc(t.call_count) + '</span>',
          esc((100 - (t.failure_rate || 0)).toFixed(0)) + '%',
          '<span class="mono">' + esc((t.avg_duration_ms || 0)) + 'ms</span>'
        ])));
  }

  if (modelsPerf.length) {
    html += section('Model Performance', modelsPerf.length + ' models',
      table(['Model', 'Calls', 'Avg Latency', 'Max Latency', 'Failure Rate'], modelsPerf.map(p => [
        esc(p.model),
        '<span class="mono">' + esc(p.call_count) + '</span>',
        '<span class="mono">' + esc(p.avg_duration_ms || 0) + 'ms</span>',
        '<span class="mono">' + esc(p.max_duration_ms || 0) + 'ms</span>',
        esc(p.failure_rate || 0) + '%'
      ])));
  }

  if (toolsPerf.length) {
    html += section('Tool Performance', toolsPerf.length + ' tools',
      table(['Tool', 'Calls', 'Avg Duration', 'Max Duration', 'Failure Rate'], toolsPerf.map(p => [
        esc(p.tool_name),
        '<span class="mono">' + esc(p.call_count) + '</span>',
        '<span class="mono">' + esc(p.avg_duration_ms || 0) + 'ms</span>',
        '<span class="mono">' + esc(p.max_duration_ms || 0) + 'ms</span>',
        esc(p.failure_rate || 0) + '%'
      ])));
  }

  html += section('Cost Analysis', fmtCost(costs.totalCost) + ' estimated',
    '<div class="panel pad report-builder">' +
    (costs.perModel.length
      ? table(['Model', 'Tokens', 'Est. Cost'], costs.perModel.map(m => [
          esc(m.model),
          '<span class="mono">' + esc(m.tokens.toLocaleString()) + '</span>',
          '<span class="mono">' + fmtCost(m.cost) + '</span>'
        ]))
      : '<div class="empty">No model usage recorded yet.</div>') +
    '</div>', false) +
    section('Optimization Recommendations', recs.length + ' suggestions',
      '<div class="rec-list">' + (recs.length ? recs.map(function (r) {
        return '<div class="rec-item"><span class="rec-icon">' + IC.terminal + '</span><span>' + esc(r) + '</span></div>';
      }).join('') : '<div class="empty">No recommendations available.</div>') + '</div>');

  if (eventTypes.length) {
    html += section('Event Breakdown', eventTypes.length + ' types',
      table(['Event Type', 'Count'], eventTypes.map(e => [esc(e.event_type), '<span class="mono">' + esc(e.count) + '</span>'])));
  }

  html += section('Report Builder', 'custom reports',
    '<div class="panel pad report-builder">' +
    '<p class="dim" style="margin-bottom:12px;display:block">Select sections and generate a JSON report.</p>' +
    '<div class="builder-opts">' + ['summary', 'models', 'tools', 'performance', 'trends', 'cost', 'events'].map(function (key) {
      return '<label class="opt"><input type="checkbox" data-report-section="' + key + '"' + (reportInclude.indexOf(key) !== -1 ? ' checked' : '') + '> ' + esc(key) + '</label>';
    }).join('') + '</div>' +
    '<button class="btn primary" data-action="report-generate">Generate report</button>' +
    '<div class="report-output" id="reportOutput" style="display:none"></div>' +
    '</div>', false);

  return html;
}

function orgForm(mode, org) {
  const isEdit = mode === 'edit';
  return '<div class="panel pad" style="margin-bottom:16px">' +
    '<div class="section-head"><h3>' + (isEdit ? 'Edit Organization' : 'Add Organization') + '</h3>' +
    '<button class="btn ghost" data-action="org-form-cancel">Cancel</button></div>' +
    '<form data-form="org">' +
    '<div class="form-grid">' +
    '<div><label>Name</label><input name="name" required value="' + esc(isEdit ? org.name : '') + '"></div>' +
    '<div><label>Slug</label><input name="slug" required value="' + esc(isEdit ? org.slug : '') + '" placeholder="acme-corp"></div>' +
    '<div><label>Tier</label><select name="tier">' +
    '<option value="community"' + (!isEdit || org.tier === 'community' ? ' selected' : '') + '>community</option>' +
    '<option value="enterprise"' + (isEdit && org.tier === 'enterprise' ? ' selected' : '') + '>enterprise</option>' +
    '<option value="enterprise-plus"' + (isEdit && org.tier === 'enterprise-plus' ? ' selected' : '') + '>enterprise-plus</option>' +
    '</select></div>' +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">' + (isEdit ? 'Save changes' : 'Create organization') + '</button></div>' +
    (isEdit ? '<input type="hidden" name="orgId" value="' + esc(org.id) + '">' : '') +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form></div>';
}

function orgSettingsPanel(org) {
  const s = org.settings || {};
  const settings = s.ssoEnabled !== undefined;
  if (!settings) return '';
  return '<div class="section-head"><h3>Settings</h3></div>' +
    '<form data-form="org-settings" data-org-id="' + esc(org.id) + '">' +
    '<div class="form-grid">' +
    '<div><label>SSO Enabled</label><select name="ssoEnabled"><option value="true"' + (s.ssoEnabled ? ' selected' : '') + '>enabled</option><option value="false"' + (!s.ssoEnabled ? ' selected' : '') + '>disabled</option></select></div>' +
    '<div><label>Audit Retention (days)</label><input name="auditLogRetentionDays" type="number" min="1" value="' + esc(s.auditLogRetentionDays ?? 90) + '"></div>' +
    '<div><label>Max Concurrent Sessions</label><input name="maxConcurrentSessions" type="number" min="1" value="' + esc(s.maxConcurrentSessions ?? 10) + '"></div>' +
    '<div><label>Enforce MFA</label><select name="enforceMfa"><option value="true"' + (s.enforceMfa ? ' selected' : '') + '>enabled</option><option value="false"' + (!s.enforceMfa ? ' selected' : '') + '>disabled</option></select></div>' +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">Save settings</button></div>' +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form>';
}

function renderOrganizations() {
  const o = state.orgs;
  if (!o) return '<div class="loading">Loading&hellip;</div>';
  const orgs = o.organizations || [];
  let html = pageHeader('Organizations', 'Tenants managed by this control plane', '<span class="pill">' + orgs.length + ' orgs</span>') +
    '<div class="toolbar"><button class="btn primary" data-action="org-create">Add Organization</button></div>';
  if (orgs.length) {
    html += section('Organizations', orgs.length + ' orgs',
      table(['Name', 'Slug', 'Tier', 'Members', 'Created', ''], orgs.map(org => [
        esc(org.name),
        '<span class="mono">' + esc(org.slug) + '</span>',
        tierBadge(org.tier),
        '<span class="mono">' + esc(org.members ? org.members.length : 0) + '</span>',
        esc(new Date(org.createdAt).toLocaleDateString()),
        '<div class="row-actions">' +
        '<button class="btn tiny" data-action="org-edit" data-id="' + esc(org.id) + '">Edit</button>' +
        '<button class="btn tiny danger" data-action="org-delete" data-id="' + esc(org.id) + '">Delete</button>' +
        '</div>'
      ])));
  } else {
    html += section('Organizations', '0 orgs', '<div class="empty">No organizations configured.</div>');
  }
  return html;
}

function statusPill(status) {
  if (status === 'deactivated') return '<span class="pill" style="color:var(--red);background:rgba(248,113,113,0.12)">deactivated</span>';
  return '<span class="pill" style="color:var(--green);background:rgba(52,211,153,0.12)">active</span>';
}

function fmtLastActive(value) {
  if (!value) return '<span class="dim">Never</span>';
  const t = new Date(value).getTime();
  if (isNaN(t)) return '<span class="dim">' + esc(value) + '</span>';
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < day) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 7 * day) return Math.floor(diff / day) + 'd ago';
  return esc(new Date(value).toLocaleDateString());
}

let usersFilter = '';
let usersRoleFilter = '';

function userForm(mode, user) {
  const isEdit = mode === 'edit';
  return '<div class="panel pad" style="margin-bottom:16px">' +
    '<div class="section-head"><h3>' + (isEdit ? 'Edit User' : 'Add User') + '</h3>' +
    '<button class="btn ghost" data-action="user-form-cancel">Cancel</button></div>' +
    '<form data-form="user">' +
    '<div class="form-grid">' +
    '<div><label>Email</label><input name="email" type="email" required value="' + esc(isEdit ? user.email : '') + '"></div>' +
    '<div><label>Role</label><select name="role">' +
    '<option value="member"' + (!isEdit || user.role === 'member' ? ' selected' : '') + '>member</option>' +
    '<option value="admin"' + (isEdit && user.role === 'admin' ? ' selected' : '') + '>admin</option>' +
    '<option value="viewer"' + (isEdit && user.role === 'viewer' ? ' selected' : '') + '>viewer</option>' +
    '</select></div>' +
    (isEdit ? '<div><label>Status</label><select name="status">' +
      '<option value="active"' + (user.status !== 'deactivated' ? ' selected' : '') + '>active</option>' +
      '<option value="deactivated"' + (user.status === 'deactivated' ? ' selected' : '') + '>deactivated</option>' +
      '</select></div>' : '') +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">' + (isEdit ? 'Save changes' : 'Create user') + '</button></div>' +
    (isEdit ? '<input type="hidden" name="userId" value="' + esc(user.userId) + '">' : '') +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form></div>';
}

function renderUsers() {
  const u = state.users;
  if (!u) return '<div class="loading">Loading&hellip;</div>';
  const users = (u.users || []).filter(user => {
    if (usersRoleFilter && user.role !== usersRoleFilter) return false;
    if (usersFilter) {
      const q = usersFilter.toLowerCase();
      if (user.email.toLowerCase().indexOf(q) === -1 && (user.orgName || '').toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });
  const active = users.filter(user => user.status !== 'deactivated').length;
  let html = pageHeader('Users', 'Manage users, roles, and access', '<span class="pill">' + active + ' active</span>') +
    '<div class="toolbar">' +
    '<input class="search" placeholder="Search email or organization&hellip;" value="' + esc(usersFilter) + '" data-search="users">' +
    '<select data-filter="role"><option value="">All roles</option><option value="admin"' + (usersRoleFilter === 'admin' ? ' selected' : '') + '>admin</option><option value="member"' + (usersRoleFilter === 'member' ? ' selected' : '') + '>member</option><option value="viewer"' + (usersRoleFilter === 'viewer' ? ' selected' : '') + '>viewer</option></select>' +
    '<button class="btn ghost" data-action="users-export">Export</button>' +
    '<button class="btn primary" data-action="user-create">Add User</button>' +
    '</div>';
  if (users.length) {
    html += section('Users', users.length + ' users',
      table(['Email', 'Organization', 'Role', 'Status', 'Last Active', 'Joined', ''], users.map(user => [
        esc(user.email),
        esc(user.orgName) + '<div class="dim">' + esc(user.orgSlug) + '</div>',
        rolePill(user.role),
        statusPill(user.status),
        fmtLastActive(user.lastActiveAt),
        esc(new Date(user.joinedAt).toLocaleDateString()),
        '<div class="row-actions">' +
        '<button class="btn tiny" data-action="user-edit" data-id="' + esc(user.userId) + '">Edit</button>' +
        (user.status === 'deactivated'
          ? '<button class="btn tiny" data-action="user-reactivate" data-id="' + esc(user.userId) + '">Reactivate</button>'
          : '<button class="btn tiny danger" data-action="user-deactivate" data-id="' + esc(user.userId) + '">Deactivate</button>') +
        '</div>'
      ])));
  } else {
    html += section('Users', users.length + ' users', '<div class="empty">No users match your filters.</div>');
  }
  return html;
}

function renderServers() {
  const s = state.servers;
  const a = state.agents;
  const servers = s && s.servers ? s.servers : [];
  const agents = a && a.agents ? a.agents : [];
  let html = pageHeader('Connections', 'MCP servers and available agents');
  html += stats([
    stat('MCP Servers', servers.length, 'chip-blue', IC.plug),
    stat('Agents', agents.length, 'chip-accent', IC.cpu)
  ]);
  html += section('Connected MCP Servers', servers.length + ' servers',
    servers.length
      ? table(['Name', 'Status'], servers.map(name => [esc(name), '<span class="status ok">Connected</span>']))
      : '<div class="empty">No MCP servers connected.</div>');
  html += section('Available Agents', agents.length + ' agents',
    agents.length
      ? table(['ID', 'Name', 'Mode'], agents.map(agent => [
          '<span class="mono">' + esc(agent.id) + '</span>',
          esc(agent.name),
          '<span class="pill">' + esc(agent.mode) + '</span>'
        ]))
      : '<div class="empty">No agents available.</div>');
  return html;
}

function renderConfig() {
  const c = state.config;
  if (!c) return '<div class="loading">Loading&hellip;</div>';
  const cfg = c.config || {};
  const llm = c.llm || {};
  const providers = (llm.providers || []).map(function (p) {
    return { id: p.id, label: p.label, apiKey: p.apiKey, baseUrl: p.baseUrl, models: (p.models || []).join(', ') };
  });
  const routing = llm.routing || {};

  function boolSelect(name, value) {
    return '<select name="' + name + '">' +
      '<option value="true"' + (value ? ' selected' : '') + '>enabled</option>' +
      '<option value="false"' + (!value ? ' selected' : '') + '>disabled</option>' +
      '</select>';
  }

  function field(label, name, value, secret) {
    const v = value == null ? '' : value;
    const masked = secret && v !== '' ? '********' : v;
    return '<div><label>' + label + '</label>' +
      '<input name="' + name + '" value="' + esc(masked) + '"' + (secret ? ' data-secret type="password" autocomplete="off"' : '') + '></div>';
  }

  let html = pageHeader('Configuration', 'Runtime settings for the agent and control plane') +
    '<div class="toolbar">' +
    '<button class="btn" data-action="config-reset">Reset to defaults</button>' +
    '<button class="btn ghost" data-action="config-export">Export JSON</button>' +
    '<button class="btn ghost" data-action="config-validate">Validate</button>' +
    '</div>';

  html += section('General', null,
    '<form data-form="config">' +
    '<div class="form-grid">' +
    field('Organization Name', 'orgName', cfg.organization && cfg.organization.name) +
    field('Selected Model', 'selectedModel', cfg.selectedModel) +
    field('Default Agent ID', 'agentId', cfg.agentId) +
    field('Theme', 'themeId', cfg.themeId) +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">Save changes</button></div>' +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form>', true);

  html += section('Authentication', null,
    '<form data-form="config-auth">' +
    '<div class="form-grid">' +
    field('SSO Client ID', 'clientId', cfg.auth && cfg.auth.clientId) +
    field('SSO Tenant ID', 'tenantId', cfg.auth && cfg.auth.tenantId) +
    field('SSO Client Secret', 'clientSecret', cfg.auth && cfg.auth.clientSecret, true) +
    field('Default API Key', 'apiKey', cfg.apiKey, true) +
    field('Default Endpoint', 'endpoint', cfg.endpoint) +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">Save changes</button></div>' +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form>', true);

  html += section('Telemetry', null,
    '<form data-form="config-telemetry">' +
    '<div class="form-grid">' +
    '<div><label>Opt-in telemetry</label>' + boolSelect('telemetryEnabled', cfg.telemetry && cfg.telemetry.enabled) + '</div>' +
    field('Ingest Endpoint', 'telemetryEndpoint', cfg.telemetry && cfg.telemetry.endpoint) +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">Save changes</button></div>' +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form>', true);

  html += section('LLM Providers', providers.length + ' providers',
    providers.length
      ? table(['Provider', 'Base URL', 'API Key', 'Models'], providers.map(function (p) {
          return [
            '<span class="pill">' + esc(p.label) + '</span>',
            '<span class="mono dim">' + esc(p.baseUrl) + '</span>',
            esc(p.apiKey ? '••••••••' : 'not set'),
            '<span class="dim">' + esc(p.models) + '</span>'
          ];
        }))
      : '<div class="empty">No providers configured.</div>');

  html += section('Model Routing', null,
    '<form data-form="config-routing">' +
    '<div class="form-grid">' +
    field('Simple Tasks Model', 'simpleModel', routing.simpleModel) +
    field('Default Model', 'defaultModel', routing.defaultModel) +
    field('Reasoning Model', 'reasoningModel', routing.reasoningModel) +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">Save changes</button></div>' +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form>', true);

  return html;
}

function renderSessions() {
  const s = state.sessions;
  if (!s) return '<div class="loading">Loading&hellip;</div>';
  const sessions = s.sessions || [];
  let html = pageHeader('Sessions', 'Recent agent sessions and context usage', '<span class="pill">' + sessions.length + ' sessions</span>');
  if (sessions.length) {
    html += section('Recent Sessions', sessions.length + ' sessions',
      table(['Label', 'Created', 'Updated', 'Messages', 'Tokens'], sessions.map(function (sess) {
        return [
          esc(sess.label || '<untitled>'),
          '<span class="mono">' + esc(new Date(sess.createdAt).toLocaleString()) + '</span>',
          '<span class="mono">' + esc(new Date(sess.updatedAt).toLocaleString()) + '</span>',
          '<span class="mono">' + esc(sess.messageCount) + '</span>',
          '<span class="mono">' + esc(sess.tokens) + '</span>'
        ];
      })));
  } else {
    html += section('Sessions', '0 sessions', '<div class="empty">No sessions recorded yet.</div>');
  }
  return html;
}

function notifIcon(level) {
  if (level === 'critical') return '<span class="pill" style="color:var(--red);background:rgba(248,113,113,0.12)">critical</span>';
  if (level === 'warning') return '<span class="pill" style="color:var(--yellow);background:rgba(251,191,36,0.12)">warning</span>';
  if (level === 'success') return '<span class="pill" style="color:var(--green);background:rgba(52,211,153,0.12)">success</span>';
  return '<span class="pill" style="color:var(--blue);background:rgba(96,165,250,0.12)">info</span>';
}

let notifLevelFilter = '';
let notifReadFilter = '';

function renderNotifications() {
  const n = state.notifications;
  if (!n) return '<div class="loading">Loading&hellip;</div>';
  const notifications = (n.notifications || []).filter(function (x) {
    if (notifLevelFilter && x.level !== notifLevelFilter) return false;
    if (notifReadFilter === 'unread' && x.read) return false;
    if (notifReadFilter === 'read' && !x.read) return false;
    return true;
  });
  const stats = n.stats || {};
  let html = pageHeader('Notifications', 'Alerts, events, and delivery preferences', '<span class="pill">' + (stats.unread || 0) + ' unread</span>') +
    '<div class="toolbar">' +
    '<select data-filter="notif-level"><option value="">All levels</option><option value="info"' + (notifLevelFilter === 'info' ? ' selected' : '') + '>info</option><option value="success"' + (notifLevelFilter === 'success' ? ' selected' : '') + '>success</option><option value="warning"' + (notifLevelFilter === 'warning' ? ' selected' : '') + '>warning</option><option value="critical"' + (notifLevelFilter === 'critical' ? ' selected' : '') + '>critical</option></select>' +
    '<select data-filter="notif-read"><option value="">Read status</option><option value="unread"' + (notifReadFilter === 'unread' ? ' selected' : '') + '>unread</option><option value="read"' + (notifReadFilter === 'read' ? ' selected' : '') + '>read</option></select>' +
    '<button class="btn ghost" data-action="notif-mark-all">Mark all read</button>' +
    '<button class="btn ghost" data-action="notif-clear">Clear</button>' +
    '<button class="btn ghost" data-action="notif-create">Create test</button>' +
    '</div>';
  html += stats([
    stat('Total', stats.total || 0, 'chip-blue', IC.file),
    stat('Unread', stats.unread || 0, 'chip-accent', IC.clock)
  ]);
  html += section('Notifications', notifications.length + ' notifications',
    notifications.length
      ? table(['', 'Title', 'Source', 'Message', 'Created', ''], notifications.map(function (x) {
          return [
            x.read ? '' : '<span style="color:var(--accent)">●</span>',
            '<strong>' + esc(x.title) + '</strong>',
            '<span class="dim">' + esc(x.source) + '</span>',
            '<span class="dim">' + esc(x.message) + '</span>',
            '<span class="mono">' + esc(new Date(x.createdAt).toLocaleString()) + '</span>',
            '<div class="row-actions">' +
            (x.read
              ? '<button class="btn tiny" data-action="notif-unread" data-id="' + esc(x.id) + '">Unread</button>'
              : '<button class="btn tiny" data-action="notif-read" data-id="' + esc(x.id) + '">Read</button>') +
            '<button class="btn tiny danger" data-action="notif-delete" data-id="' + esc(x.id) + '">Delete</button>' +
            '</div>'
          ];
        }))
      : '<div class="empty">No notifications.</div>');
  html += section('Delivery Preferences', null,
    '<form data-form="notif-prefs">' +
    '<div class="form-grid">' +
    '<div><label>Email delivery</label><select name="emailEnabled"><option value="true"' + (n.preferences && n.preferences.emailEnabled ? ' selected' : '') + '>enabled</option><option value="false"' + (!(n.preferences && n.preferences.emailEnabled) ? ' selected' : '') + '>disabled</option></select></div>' +
    '<div><label>Slack delivery</label><select name="slackEnabled"><option value="true"' + (n.preferences && n.preferences.slackEnabled ? ' selected' : '') + '>enabled</option><option value="false"' + (!(n.preferences && n.preferences.slackEnabled) ? ' selected' : '') + '>disabled</option></select></div>' +
    '<div><label>Minimum level</label><select name="minLevel">' +
    '<option value="info"' + (n.preferences && n.preferences.minLevel === 'info' ? ' selected' : '') + '>info</option>' +
    '<option value="success"' + (n.preferences && n.preferences.minLevel === 'success' ? ' selected' : '') + '>success</option>' +
    '<option value="warning"' + (n.preferences && n.preferences.minLevel === 'warning' ? ' selected' : '') + '>warning</option>' +
    '<option value="critical"' + (n.preferences && n.preferences.minLevel === 'critical' ? ' selected' : '') + '>critical</option>' +
    '</select></div>' +
    '<div><label>Webhook URL</label><input name="webhookUrl" value="' + esc(n.preferences && n.preferences.webhookUrl ? n.preferences.webhookUrl : '') + '" placeholder="https://..."></div>' +
    '</div>' +
    '<div class="form-actions"><button type="submit" class="btn primary">Save preferences</button></div>' +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form>', true);
  return html;
}

/* ---- exports ---- */
let exportSource = 'audit';
let exportFormat = 'csv';
let exportFilters = '';

function exportFilterFields(source) {
  if (source === 'analytics') {
    return '<div><label>Days</label><select name="days"><option value="7">7</option><option value="30"' + (exportFilters === '30' ? ' selected' : '') + '>30</option><option value="90">90</option></select></div>';
  }
  if (source === 'users') {
    return '<div><label>Role</label><select name="role"><option value="">All</option><option value="admin">admin</option><option value="member">member</option><option value="viewer">viewer</option></select></div>' +
      '<div><label>Status</label><select name="status"><option value="">All</option><option value="active">active</option><option value="deactivated">deactivated</option></select></div>';
  }
  if (source === 'audit') {
    return '<div><label>Actor</label><input name="actor" placeholder="Optional filter"></div>' +
      '<div><label>Limit</label><input name="limit" type="number" value="500" min="1" max="10000"></div>';
  }
  return '<div></div><div></div>';
}

function renderExports() {
  const e = state.exports || { exports: [] };
  const tpl = state.templates || { templates: [] };
  const history = e.exports || [];
  const templates = tpl.templates || [];

  let html = pageHeader('Exports', 'Download data, manage templates, and schedule exports') +
    '<div class="toolbar">' +
    '<button class="btn ghost" data-action="export-bulk">Bulk download (all sources)</button>' +
    '<button class="btn ghost danger" data-action="exports-clear">Clear history</button>' +
    '</div>';

  html += section('Export Wizard', null,
    '<div class="panel pad">' +
    '<div class="form-grid">' +
    '<div><label>Data source</label><select id="exportSource">' +
    '<option value="audit"' + (exportSource === 'audit' ? ' selected' : '') + '>Audit logs</option>' +
    '<option value="analytics"' + (exportSource === 'analytics' ? ' selected' : '') + '>Analytics</option>' +
    '<option value="users"' + (exportSource === 'users' ? ' selected' : '') + '>Users</option>' +
    '<option value="config"' + (exportSource === 'config' ? ' selected' : '') + '>Configuration</option>' +
    '</select></div>' +
    '<div><label>Format</label><select id="exportFormat">' +
    '<option value="csv"' + (exportFormat === 'csv' ? ' selected' : '') + '>CSV</option>' +
    '<option value="json"' + (exportFormat === 'json' ? ' selected' : '') + '>JSON</option>' +
    '</select></div>' +
    '</div>' +
    '<div class="form-grid" id="exportFilters">' + exportFilterFields(exportSource) + '</div>' +
    '<div class="form-actions" style="display:flex;gap:8px">' +
    '<button class="btn primary" data-action="export-download">Download</button>' +
    '<button class="btn" data-action="export-template-save">Save as template</button>' +
    '</div></div>', false);

  html += section('Export Templates', templates.length + ' templates',
    templates.length
      ? table(['Name', 'Source', 'Format', 'Schedule', 'Last Run', ''], templates.map(t => [
          esc(t.name),
          esc(t.source),
          '<span class="pill">' + esc(t.format) + '</span>',
          '<span class="pill">' + esc(t.schedule) + '</span>',
          t.lastRunAt ? '<span class="mono">' + esc(t.lastRunAt.slice(0, 16)) + '</span>' : '<span class="dim">never</span>',
          '<div class="row-actions">' +
          '<button class="btn tiny" data-action="template-run" data-id="' + esc(t.id) + '">Run</button>' +
          '<button class="btn tiny" data-action="template-delete" data-id="' + esc(t.id) + '">Delete</button>' +
          '</div>'
        ]))
      : '<div class="empty">No export templates saved.</div>');

  html += section('Export History', history.length + ' exports',
    history.length
      ? table(['Source', 'Format', 'Filters', 'Created By', 'Created', ''], history.map(x => [
          esc(x.source),
          '<span class="pill">' + esc(x.format) + '</span>',
          '<span class="dim">' + esc(x.filters || '-') + '</span>',
          esc(x.createdBy),
          '<span class="mono">' + esc(new Date(x.createdAt).toLocaleString()) + '</span>',
          '<div class="row-actions">' +
          '<button class="btn tiny" data-action="export-redownload" data-source="' + esc(x.source) + '" data-format="' + esc(x.format) + '" data-params="' + esc(x.params || '') + '">Download</button>' +
          '<button class="btn tiny danger" data-action="export-delete" data-id="' + esc(x.id) + '">Delete</button>' +
          '</div>'
        ]))
      : '<div class="empty">No exports yet.</div>');

  return html;
}

/* ---- api docs ---- */
let apiSpec = null;
let selectedEp = null;
let apiResponse = null;

function flattenEndpoints(spec) {
  const out = [];
  if (!spec || !spec.paths) return out;
  const ordered = Object.keys(spec.paths).sort();
  ordered.forEach(function (path) {
    Object.keys(spec.paths[path]).forEach(function (method) {
      out.push({ path: path, method: method, meta: spec.paths[path][method] });
    });
  });
  return out;
}

async function loadApiSpec() {
  try {
    const data = await fetchJSON(API + '/docs/openapi');
    apiSpec = data;
    const eps = flattenEndpoints(data);
    if (eps.length) selectedEp = eps[0];
  } catch (err) {
    apiSpec = null;
  }
  if (getActiveView() === 'apidocs') renderView('apidocs');
}

function renderApiDocs() {
  if (!apiSpec) return '<div class="loading">Loading API spec&hellip;</div>';
  const eps = flattenEndpoints(apiSpec);
  if (!selectedEp && eps.length) selectedEp = eps[0];

  const listHtml = '<div class="api-endpoints">' + eps.map(function (ep) {
    const active = selectedEp && selectedEp.path === ep.path && selectedEp.method === ep.method ? ' active' : '';
    return '<div class="ep' + active + '" data-endpoint="' + esc(ep.path) + '" data-method="' + esc(ep.method) + '">' +
      '<span class="ep-method ' + esc(ep.method) + '">' + esc(ep.method) + '</span>' +
      '<span class="mono">' + esc(ep.path) + '</span></div>';
  }).join('') + '</div>';

  let consoleHtml = '<div class="panel pad api-console">';
  if (!selectedEp) {
    consoleHtml += '<div class="empty">Select an endpoint to test.</div>';
  } else {
    const params = selectedEp.meta.parameters || [];
    const isBody = selectedEp.method === 'post' || selectedEp.method === 'put';
    consoleHtml += '<div class="section-head"><h3><span class="ep-method ' + esc(selectedEp.method) + '" style="display:inline-block;width:auto;padding:3px 8px">' + esc(selectedEp.method) + '</span> <span class="mono-path">' + esc(selectedEp.path) + '</span></h3></div>';
    consoleHtml += '<p class="dim" style="margin-bottom:14px;display:block">' + esc(selectedEp.meta.summary || '') + '</p>';
    consoleHtml += '<div data-api-params style="margin-bottom:12px">' +
      (params.length
        ? '<div class="form-grid">' + params.map(function (p) {
            return '<div><label>' + esc(p.name) + ' (query)</label><input data-api-param="' + esc(p.name) + '" placeholder=""></div>';
          }).join('') + '</div>'
        : '<div class="empty" style="padding:12px">No query parameters.</div>') +
      '</div>';
    consoleHtml += '<div class="form-grid" style="margin-bottom:12px">' +
      '<div><label>Header key</label><input data-api-hdrk placeholder="Authorization"></div>' +
      '<div><label>Header value</label><input data-api-hdrv placeholder="Optional custom header value"></div>' +
      '</div>';
    if (isBody) {
      consoleHtml += '<label style="font-size:12px;font-weight:600;color:var(--text-muted)">JSON body</label>' +
        '<textarea data-api-body style="margin:6px 0 12px;min-height:120px" placeholder="{ }"></textarea>';
    }
    consoleHtml += '<button class="btn primary" data-action="api-send">Send request</button>';
    if (apiResponse) {
      consoleHtml += '<div class="report-output" id="apiOutput" style="display:block;margin-top:14px">' + esc(apiResponse) + '</div>';
    }
  }
  consoleHtml += '</div>';

  return pageHeader('API Docs', 'Discover and test the dashboard API') +
    '<div class="api-layout">' + listHtml + consoleHtml + '</div>';
}

async function sendApiRequest() {
  if (!selectedEp) return;
  const params = document.querySelectorAll('[data-api-param]');
  const url = new URL(API + selectedEp.path.replace(/:([^/]+)/g, function (_, name) {
    const input = document.querySelector('[data-api-path="' + name + '"]');
    return input ? encodeURIComponent(input.value || ':') : ':';
  }), location.origin);
  params.forEach(function (p) {
    if (p.value) url.searchParams.set(p.name, p.value);
  });
  const headers = { 'Content-Type': 'application/json' };
  const hdrk = document.querySelector('[data-api-hdrk]');
  const hdrv = document.querySelector('[data-api-hdrv]');
  if (hdrk && hdrk.value) headers[hdrk.value] = hdrv ? hdrv.value : '';
  const body = selectedEp.method === 'post' || selectedEp.method === 'put'
    ? document.querySelector('[data-api-body]').value
    : undefined;
  try {
    const start = performance.now();
    const res = await fetch(url.toString(), {
      method: selectedEp.method.toUpperCase(),
      headers: headers,
      body: body ? body : undefined
    });
    const text = await res.text();
    const elapsed = Math.round(performance.now() - start);
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {}
    apiResponse = res.status + ' ' + res.statusText + '  (' + elapsed + 'ms)\\n\\n' + pretty;
  } catch (err) {
    apiResponse = 'Request failed: ' + err.message;
  }
  renderView('apidocs');
}

/* ---- boot ---- */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadAll() {
  try {
    const [status, license, audit, analytics, orgs, servers, agents, users, config, sessions, notifications, notifPrefs, exports, templates, securityEvents, alerts, policies, compliance, rbacRoles, rbacPermissions, rbacAnalytics, rbacAssignments] = await Promise.all([
      fetchJSON(API + '/status'),
      fetchJSON(API + '/license'),
      fetchJSON(API + '/audit'),
      fetchJSON(API + '/analytics'),
      fetchJSON(API + '/orgs'),
      fetchJSON(API + '/servers'),
      fetchJSON(API + '/agents'),
      fetchJSON(API + '/users'),
      fetchJSON(API + '/config'),
      fetchJSON(API + '/sessions'),
      fetchJSON(API + '/notifications'),
      fetchJSON(API + '/notifications/preferences'),
      fetchJSON(API + '/exports'),
      fetchJSON(API + '/export-templates'),
      fetchJSON(API + '/security/events'),
      fetchJSON(API + '/security/alerts'),
      fetchJSON(API + '/security/policies'),
      fetchJSON(API + '/security/compliance'),
      fetchJSON(API + '/rbac/roles'),
      fetchJSON(API + '/rbac/permissions'),
      fetchJSON(API + '/rbac/analytics'),
      fetchJSON(API + '/rbac/assignments')
    ]);
    state = { status, license, audit, analytics, orgs, servers, agents, users, config, sessions, notifications: { ...notifications, preferences: notifPrefs.preferences }, exports, templates, security: securityEvents, alerts, policies, compliance, rbacRoles, rbacPermissions, rbacAnalytics, rbacAssignments };
    loadAnalytics();
    loadSecurityThreats();
    if (!apiSpec) loadApiSpec();
    renderView(getActiveView());
  } catch (err) {
    document.getElementById('content').innerHTML = '<div class="error">Failed to load dashboard: ' + err.message + '</div>';
  }
}

let securityThreats = null;
async function loadSecurityThreats() {
  try {
    securityThreats = await fetchJSON(API + '/security/threats');
  } catch (_) {
    securityThreats = { threats: [], eventCount: 0 };
  }
  if (getActiveView() === 'security') renderView('security');
}

async function loadAudit() {
  const q = [];
  if (auditActorFilter) q.push('actor=' + encodeURIComponent(auditActorFilter));
  if (auditActionFilter) q.push('action=' + encodeURIComponent(auditActionFilter));
  if (auditSinceFilter) q.push('since=' + encodeURIComponent(auditSinceFilter));
  if (auditUntilFilter) q.push('until=' + encodeURIComponent(auditUntilFilter));
  q.push('limit=200');
  try {
    state.audit = await fetchJSON(API + '/audit?' + q.join('&'));
  } catch (_) {
    state.audit = null;
  }
  if (getActiveView() === 'audit') renderView('audit');
}

function applyAuditFilter(form) {
  const fd = new FormData(form);
  auditActorFilter = String(fd.get('actor') || '').trim();
  auditActionFilter = String(fd.get('action') || '').trim();
  auditSinceFilter = String(fd.get('since') || '').trim();
  auditUntilFilter = String(fd.get('until') || '').trim();
  loadAudit();
}

function severityPill(sev) {
  const cls = sev === 'critical' ? 'chip-red' : (sev === 'high' ? 'chip-red' : (sev === 'medium' ? 'chip-yellow' : (sev === 'low' ? 'chip-blue' : '')));
  return '<span class="pill ' + cls + '">' + esc(sev) + '</span>';
}

function policyRow(policy) {
  return '<div class="panel pad" style="margin-bottom:8px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
    '<div><div style="font-weight:600">' + esc(policy.key) + '</div>' +
    '<div class="dim" style="font-size:12px">' + esc(policy.description) + '</div></div>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
    (typeof policy.value === 'boolean' || policy.value === true || policy.value === false
      ? '<label class="kv-row" style="gap:6px;font-size:12px"><input type="checkbox" data-policy-key="' + esc(policy.key) + '" data-policy-field="value"' + (policy.value === true ? ' checked' : '') + '> Enabled</label>'
      : '<input data-policy-key="' + esc(policy.key) + '" data-policy-field="value" type="number" value="' + esc(String(policy.value)) + '" style="width:90px">') +
    '<button class="btn" data-action="policy-save" data-key="' + esc(policy.key) + '">Save</button>' +
    '</div></div></div>';
}

function renderSecurity() {
  const s = state.security;
  if (!s) return '<div class="loading">Loading&hellip;</div>';
  const events = (s.events || []).slice(0, 40);
  const statsData = s.stats || { total: 0, bySeverity: {}, byCategory: {} };
  const alerts = (state.alerts && state.alerts.alerts) || [];
  const openAlerts = alerts.filter(a => a.status === 'open').length;
  const threats = (securityThreats && securityThreats.threats) || [];
  const policies = (state.policies && state.policies.policies) || [];
  const critical = (statsData.bySeverity && statsData.bySeverity.critical) || 0;

  let html = pageHeader('Security', 'Threat detection, event timeline, and incident response');
  html += stats([
    stat('Security Events', statsData.total || 0, 'chip-blue', IC.shield),
    stat('Open Alerts', openAlerts, openAlerts > 0 ? 'chip-red' : 'chip-green', IC.shield),
    stat('High / Critical', critical + ((statsData.bySeverity && statsData.bySeverity.high) || 0), critical > 0 ? 'chip-red' : 'chip-green', IC.x),
    stat('Active Threats', threats.length, threats.length > 0 ? 'chip-red' : 'chip-green', IC.shield)
  ]);

  if (threats.length) {
    html += section('Threat Indicators', threats.length + ' threats',
      table(['Severity', 'Category', 'Events', 'Detection', 'Recommendation'], threats.map(t => [
        severityPill(t.severity),
        esc(t.category),
        '<span class="mono">' + esc(t.eventCount) + '</span>',
        esc(t.title),
        '<span class="dim">' + esc(t.recommendation) + '</span>'
      ])));
  }

  html += section('Alerts', openAlerts + ' open',
    alerts.length
      ? table(['Level', 'Title', 'Detail', 'Status', ''], alerts.map(a => [
          severityPill(a.level),
          esc(a.title),
          '<span class="dim">' + esc(a.detail) + '</span>',
          a.status === 'open' ? '<span class="pill chip-red">open</span>' : '<span class="pill chip-green">resolved</span>',
          '<div class="row-actions">' +
            (a.status === 'open' ? '<button class="btn" data-action="alert-resolve" data-id="' + esc(a.id) + '">Resolve</button>' : '') +
            '<button class="btn danger" data-action="alert-delete" data-id="' + esc(a.id) + '">Delete</button>' +
          '</div>'
        ]))
      : '<div class="empty">No security alerts. All clear.</div>') +
    '<div class="toolbar" style="margin-top:12px"><button class="btn danger" data-action="alerts-clear">Clear resolved alerts</button></div>';

  html += section('Event Timeline', events.length + ' events',
    events.length
      ? table(['Time', 'Severity', 'Category', 'Actor', 'Action', 'Resource', 'Detail'], events.map(e => [
          '<span class="mono">' + esc(new Date(e.timestamp).toLocaleString()) + '</span>',
          severityPill(e.severity),
          esc(e.category),
          esc(e.actor),
          '<span class="pill">' + esc(e.action) + '</span>',
          esc(e.resource),
          '<span class="dim">' + esc(e.detail) + '</span>'
        ]))
      : '<div class="empty">No security events recorded yet.</div>');

  html += section('Security Policies', policies.length + ' policies',
    policies.map(policyRow).join(''));
  return html;
}

function renderCompliance() {
  const c = state.compliance;
  if (!c) return '<div class="loading">Loading&hellip;</div>';
  const reqs = c.requirements || [];
  const frameworks = c.frameworks || [];
  const policies = (state.policies && state.policies.policies) || [];
  const auditPolicies = policies.filter(function (p) {
    return ['auditRetentionDays', 'requireAuditIntegrity', 'ipAnonymization', 'enforceRbac'].indexOf(p.key) >= 0;
  });
  let html = pageHeader('Compliance', 'SOC 2 and GDPR readiness, audit integrity, and reporting');
  html += stats([
    stat('Overall Score', c.score + '%', c.score >= 80 ? 'chip-green' : (c.score >= 50 ? 'chip-yellow' : 'chip-red'), IC.check),
    stat('Requirements Met', reqs.filter(r => r.satisfied).length + ' / ' + reqs.length, 'chip-blue', IC.file),
    stat('Audit Events', (state.audit && state.audit.stats && state.audit.stats.total) || 0, 'chip-accent', IC.file),
    stat('Telemetry', (state.status && state.status.telemetry) ? 'enabled' : 'opt-in', 'chip-purple', IC.monitor)
  ]);

  html += section('Framework Scores', frameworks.length + ' frameworks',
    table(['Framework', 'Met / Total', 'Score'], frameworks.map(f => [
      esc(f.framework),
      f.met + ' / ' + f.total,
      '<span class="mono">' + esc(f.score) + '%</span>'
    ])));

  html += section('Requirements', reqs.length + ' requirements',
    table(['Framework', 'Requirement', 'Status', 'Detail'], reqs.map(r => [
      esc(r.framework),
      esc(r.requirement),
      r.satisfied ? '<span class="pill chip-green">met</span>' : '<span class="pill chip-red">open</span>',
      '<span class="dim">' + esc(r.detail) + '</span>'
    ])));

  if (auditPolicies.length) {
    html += section('Audit & Security Policies', auditPolicies.length + ' policies',
      auditPolicies.map(policyRow).join(''));
  }

  html += section('Audit Log Integrity', null,
    '<div id="integrityBox">' + integrityHtml() + '</div>' +
    '<div class="toolbar" style="margin-top:12px">' +
    '<button class="btn" data-action="integrity-check">Re-verify integrity</button>' +
    '</div>');

  html += section('Compliance Report', null,
    '<div class="toolbar" style="gap:8px;margin-bottom:8px">' +
    '<button class="btn primary" data-action="compliance-report">Generate report</button>' +
    '<button class="btn" data-action="compliance-report-copy" style="display:none">Copy to clipboard</button>' +
    '</div>' +
    '<pre id="complianceReport" class="report-output" style="display:none"></pre>');
  return html;
}

function integrityHtml() {
  const i = state.auditIntegrity;
  if (!i) return '<div class="loading">Loading&hellip;</div>';
  if (i.total === 0) return '<div class="empty">No audit events to verify.</div>';
  if (i.valid) {
    return '<div class="kv-row"><span class="pill chip-green">verified</span> <span class="dim">' + i.verified + ' events form an unbroken hash chain.</span></div>';
  }
  if (i.legacy > 0) {
    return '<div class="kv-row"><span class="pill chip-yellow">legacy</span> <span class="dim">' + i.legacy + ' events predate integrity tracking and ' + i.verified + ' are chained.</span></div>';
  }
  return '<div class="kv-row"><span class="pill chip-red">tampered</span> <span class="dim">Chain broken at index ' + i.brokenIndex + ' of ' + i.total + ' events.</span></div>';
}

async function loadAuditIntegrity() {
  try {
    state.auditIntegrity = await fetchJSON(API + '/audit/integrity');
  } catch (_) {
    state.auditIntegrity = null;
  }
  if (getActiveView() === 'compliance') renderView('compliance');
}

function permLabel(key) {
  for (const g of (state.rbacPermissions && state.rbacPermissions.groups) || []) {
    const p = g.permissions.find(x => x.key === key);
    if (p) return p.label;
  }
  return key;
}

function renderRbac() {
  const roles = (state.rbacRoles && state.rbacRoles.roles) || [];
  const groups = (state.rbacPermissions && state.rbacPermissions.groups) || [];
  const analytics = state.rbacAnalytics || { roleCount: 0, customRoleCount: 0, assignmentCount: 0, permissionsCovered: 0, totalPermissions: 0 };
  const assignments = (state.rbacAssignments && state.rbacAssignments.assignments) || [];
  const users = (state.users && state.users.users) || [];
  const byRole = {};
  assignments.forEach(a => {
    if (!byRole[a.roleId]) byRole[a.roleId] = [];
    byRole[a.roleId].push(a.userId);
  });
  const userById = {};
  users.forEach(u => { userById[u.userId] = u.email; });

  let html = pageHeader('Access Control', 'Roles, permissions, inheritance, and assignments');
  html += stats([
    stat('Roles', analytics.roleCount || roles.length, 'chip-blue', IC.users),
    stat('Custom Roles', analytics.customRoleCount || 0, 'chip-accent', IC.users),
    stat('Assignments', analytics.assignmentCount || 0, 'chip-purple', IC.users),
    stat('Permission Coverage', analytics.permissionsCovered + ' / ' + analytics.totalPermissions, 'chip-green', IC.check)
  ]);

  html += section('Roles', roles.length + ' roles',
    table(['Role', 'Built-in', 'Permissions', 'Users', 'Parent', ''], roles.map(r => [
      esc(r.name),
      r.builtin ? '<span class="pill chip-blue">built-in</span>' : '<span class="pill">custom</span>',
      '<span class="mono">' + r.permissions.length + '</span>',
      '<span class="mono">' + ((byRole[r.id] || []).length) + '</span>',
      r.parentRoleId ? esc((roles.find(x => x.id === r.parentRoleId) || {}).name || '') : '<span class="dim">—</span>',
      '<div class="row-actions">' +
        '<button class="btn" data-action="role-clone" data-id="' + esc(r.id) + '" data-name="' + esc(r.name) + '">Clone</button>' +
        (r.builtin ? '' : '<button class="btn" data-action="role-edit" data-id="' + esc(r.id) + '">Edit</button>' +
        '<button class="btn danger" data-action="role-delete" data-id="' + esc(r.id) + '">Delete</button>') +
      '</div>'
    ])) +
    '<div class="toolbar" style="margin-top:12px"><button class="btn primary" data-action="role-new">New role</button></div>');

  html += section('Permission Matrix', groups.length + ' groups',
    table(['Permission', 'Key', 'Description'], groups.flatMap(g => g.permissions.map(p => [
      esc(p.label),
      '<span class="mono">' + esc(p.key) + '</span>',
      '<span class="dim">' + esc(p.description) + '</span>'
    ]))));

  html += section('Assignments', assignments.length + ' assignments',
    '<form data-form="rbac-assign" class="toolbar" style="gap:8px;margin-bottom:12px">' +
    '<select name="userId" style="min-width:200px">' + users.map(u => '<option value="' + esc(u.userId) + '">' + esc(u.email) + '</option>').join('') + '</select>' +
    '<select name="roleId" style="min-width:160px">' + roles.map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select>' +
    '<button type="submit" class="btn primary">Assign role</button>' +
    '<span class="error" data-form-error style="display:none;margin:0"></span>' +
    '</form>' +
    table(['User', 'Roles'], users.map(u => [
      esc(u.email),
      assignments.filter(a => a.userId === u.userId).map(a => {
        const role = roles.find(r => r.id === a.roleId);
        return '<span class="pill">' + esc(role ? role.name : a.roleId) + ' <button class="btn ghost" data-action="role-unassign" data-user="' + esc(u.userId) + '" data-role="' + esc(a.roleId) + '" style="padding:0 4px;font-size:11px">x</button></span>';
      }).join(' ') || '<span class="dim">No roles assigned</span>'
    ])));

  const allPermKeys = groups.flatMap(g => g.permissions.map(p => p.key));
  html += section('Permission Testing', null,
    '<form data-form="rbac-check" class="toolbar" style="gap:8px;margin-bottom:8px">' +
    '<select name="userId" style="min-width:200px">' + users.map(u => '<option value="' + esc(u.userId) + '">' + esc(u.email) + '</option>').join('') + '</select>' +
    '<select name="permission" style="min-width:220px">' + allPermKeys.map(k => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('') + '</select>' +
    '<button type="submit" class="btn primary">Check permission</button>' +
    '<button type="button" class="btn ghost" data-action="rbac-check-summary">User summary</button>' +
    '<span class="error" data-form-error style="display:none;margin:0"></span>' +
    '</form>' +
    '<div id="rbacCheckResult"></div>');
  return html;
}

function roleForm(mode, role) {
  const roles = (state.rbacRoles && state.rbacRoles.roles) || [];
  const groups = (state.rbacPermissions && state.rbacPermissions.groups) || [];
  const perms = role ? role.permissions : [];
  const deny = role ? role.deny : [];
  const checkboxGroup = function (g) {
    return '<div style="margin-bottom:8px"><div style="font-weight:600;font-size:12px;margin-bottom:4px">' + esc(g.label) + '</div>' +
      g.permissions.map(function (p) {
        return '<label class="kv-row" style="gap:6px;font-size:12px;margin-right:10px"><input type="checkbox" name="perm" value="' + esc(p.key) + '"' + (perms.indexOf(p.key) >= 0 ? ' checked' : '') + '> ' + esc(p.label) + '</label>';
      }).join('') + '</div>';
  };
  return '<div class="section"><div class="section-head"><h3>' + (mode === 'edit' ? 'Edit role' : 'New role') + '</h3>' +
    '<span class="count">' + esc(role ? role.name : 'custom') + '</span></div>' +
    '<div class="panel pad">' +
    '<form data-form="rbac-role">' +
    '<input type="hidden" name="roleId" value="' + esc(role ? role.id : '') + '">' +
    '<div class="form-grid">' +
    '<div><label class="label">Role name</label><input name="name" value="' + esc(role ? role.name : '') + '" placeholder="e.g. platform-engineer" required></div>' +
    '<div><label class="label">Parent role</label><select name="parentRoleId">' +
    '<option value="">None</option>' +
    roles.filter(function (r) { return !role || r.id !== role.id; }).map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (role && role.parentRoleId === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>';
    }).join('') + '</select></div>' +
    '</div>' +
    '<label class="label" style="display:block;margin:12px 0 4px">Description</label>' +
    '<textarea name="description" rows="2" style="width:100%">' + esc(role ? role.description : '') + '</textarea>' +
    '<label class="label" style="display:block;margin:12px 0 4px">Granted permissions</label>' +
    groups.map(checkboxGroup).join('') +
    '<div class="form-actions"><button type="submit" class="btn primary">' + (mode === 'edit' ? 'Save role' : 'Create role') + '</button>' +
    '<button type="button" class="btn" data-action="role-form-cancel">Cancel</button></div>' +
    '<div class="error" data-form-error style="display:none"></div>' +
    '</form></div></div>';
}

async function submitRoleForm(form) {
  const fd = new FormData(form);
  const errBox = form.querySelector('[data-form-error]');
  errBox.style.display = 'none';
  const roleId = fd.get('roleId');
  const name = String(fd.get('name') || '').trim();
  if (!name) { errBox.textContent = 'Role name is required.'; errBox.style.display = 'block'; return; }
  const perms = form.querySelectorAll('input[name="perm"]:checked');
  const permissions = [];
  perms.forEach(function (p) { permissions.push(p.value); });
  const parentRoleId = fd.get('parentRoleId') || null;
  const payload = { name: name, description: String(fd.get('description') || ''), permissions: permissions, parentRoleId: parentRoleId };
  const r = roleId
    ? await apiJSON('PUT', '/api/rbac/roles/' + encodeURIComponent(roleId), payload)
    : await apiJSON('POST', '/api/rbac/roles', payload);
  if (!r.ok) {
    errBox.textContent = (r.data && r.data.error) || 'Request failed.';
    errBox.style.display = 'block';
    return;
  }
  toast(roleId ? 'Role updated.' : 'Role created.');
  const formPanel = form.closest('.section');
  if (formPanel) formPanel.remove();
  loadAll();
}

function getActiveView() {
  const active = document.querySelector('.nav .active');
  return active ? active.dataset.view : 'overview';
}

function renderView(view) {
  const content = document.getElementById('content');
  switch (view) {
    case 'overview': content.innerHTML = renderOverview(); break;
    case 'license': content.innerHTML = renderLicense(); break;
    case 'audit': content.innerHTML = renderAudit(); break;
    case 'analytics': content.innerHTML = renderAnalytics(); break;
    case 'organizations': content.innerHTML = renderOrganizations(); break;
    case 'users': content.innerHTML = renderUsers(); break;
    case 'servers': content.innerHTML = renderServers(); break;
    case 'config': content.innerHTML = renderConfig(); break;
    case 'sessions': content.innerHTML = renderSessions(); break;
    case 'notifications': content.innerHTML = renderNotifications(); break;
    case 'exports': content.innerHTML = renderExports(); break;
    case 'apidocs': content.innerHTML = renderApiDocs(); break;
    case 'security': content.innerHTML = renderSecurity(); break;
    case 'compliance': content.innerHTML = renderCompliance(); break;
    case 'rbac': content.innerHTML = renderRbac(); break;
  }
}

async function apiJSON(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, data };
}

function toast(message, isError) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = 'toast'; }, 2600);
}

async function submitUserForm(form) {
  const fd = new FormData(form);
  const errBox = form.querySelector('[data-form-error]');
  errBox.style.display = 'none';
  const userId = fd.get('userId');
  const email = String(fd.get('email') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errBox.textContent = 'Enter a valid email address.';
    errBox.style.display = 'block';
    return;
  }
  const payload = { email };
  if (userId) {
    const role = fd.get('role');
    const status = fd.get('status');
    payload.role = role;
    payload.status = status;
  } else {
    payload.role = fd.get('role') || 'member';
  }
  const r = userId
    ? await apiJSON('PUT', '/api/users/' + encodeURIComponent(userId), payload)
    : await apiJSON('POST', '/api/users/create', payload);
  if (!r.ok) {
    errBox.textContent = (r.data && r.data.error) || 'Request failed.';
    errBox.style.display = 'block';
    return;
  }
  toast(userId ? 'User updated.' : 'User created.');
  usersFilter = '';
  usersRoleFilter = '';
  await loadAll();
}

async function submitOrgForm(form) {
  const fd = new FormData(form);
  const errBox = form.querySelector('[data-form-error]');
  errBox.style.display = 'none';
  const orgId = fd.get('orgId');
  const name = String(fd.get('name') || '').trim();
  const slug = String(fd.get('slug') || '').trim().toLowerCase();
  if (!name) {
    errBox.textContent = 'Organization name is required.';
    errBox.style.display = 'block';
    return;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errBox.textContent = 'Slug must be lowercase alphanumeric with hyphens (e.g. acme-corp).';
    errBox.style.display = 'block';
    return;
  }
  const tier = fd.get('tier') || 'community';
  const payload = { name, slug, tier };
  const r = orgId
    ? await apiJSON('PUT', '/api/orgs/' + encodeURIComponent(orgId), payload)
    : await apiJSON('POST', '/api/orgs/create', payload);
  if (!r.ok) {
    errBox.textContent = (r.data && r.data.error) || 'Request failed.';
    errBox.style.display = 'block';
    return;
  }
  toast(orgId ? 'Organization updated.' : 'Organization created.');
  await loadAll();
}

async function submitOrgSettings(form) {
  const fd = new FormData(form);
  const errBox = form.querySelector('[data-form-error]');
  errBox.style.display = 'none';
  const orgId = form.dataset.orgId;
  const payload = {
    ssoEnabled: fd.get('ssoEnabled') === 'true',
    auditLogRetentionDays: parseInt(fd.get('auditLogRetentionDays') || '90', 10),
    maxConcurrentSessions: parseInt(fd.get('maxConcurrentSessions') || '10', 10),
    enforceMfa: fd.get('enforceMfa') === 'true'
  };
  const r = await apiJSON('PUT', '/api/orgs/' + encodeURIComponent(orgId), { settings: payload });
  if (!r.ok) {
    errBox.textContent = (r.data && r.data.error) || 'Failed to save settings.';
    errBox.style.display = 'block';
    return;
  }
  toast('Settings saved.');
  await loadAll();
}

function buildExportUrl(source, format, filters) {
  const qs = [];
  qs.push('format=' + encodeURIComponent(format));
  if (filters) {
    const clean = filters.charAt(0) === '?' ? filters.slice(1) : filters;
    if (clean) qs.push(clean);
  }
  return API + '/export/' + encodeURIComponent(source) + '?' + qs.join('&');
}

function downloadExport(source, format, filters) {
  const a = document.createElement('a');
  a.href = buildExportUrl(source, format, filters);
  a.download = '';
  a.click();
}

function currentExportFilters() {
  const out = [];
  const filterEl = document.getElementById('exportFilters');
  if (filterEl) {
    filterEl.querySelectorAll('input,select').forEach(function (el) {
      if (el.value && el.name && el.name !== 'format') {
        out.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(el.value));
      }
    });
  }
  return out.join('&');
}

async function generateReport() {
  const r = await apiJSON('POST', '/api/analytics/report', { days: analyticsDays, include: reportInclude });
  const output = document.getElementById('reportOutput');
  if (!output) return;
  if (!r.ok) {
    output.style.display = 'block';
    output.textContent = 'Report generation failed: ' + ((r.data && r.data.error) || r.status);
    return;
  }
  output.style.display = 'block';
  output.textContent = JSON.stringify(r.data, null, 2);
  toast('Report generated.');
}

async function saveExportTemplate() {
  const source = document.getElementById('exportSource').value;
  const format = document.getElementById('exportFormat').value;
  const filters = currentExportFilters();
  const name = prompt('Name this export template:', source + ' (' + format + ')');
  if (!name) return;
  const r = await apiJSON('POST', '/api/export-templates', { name: name, source: source, format: format, filters: filters, schedule: 'none' });
  if (!r.ok) { toast((r.data && r.data.error) || 'Failed to save template.', true); return; }
  toast('Template saved.');
  loadAll();
}

document.addEventListener('click', function (e) {
  const li = e.target.closest('.nav li');
  if (li) {
    document.querySelectorAll('.nav li').forEach(l => l.classList.remove('active'));
    li.classList.add('active');
    renderView(li.dataset.view);
    return;
  }
  const rangeBtn = e.target.closest('[data-range]');
  if (rangeBtn) {
    analyticsDays = parseInt(rangeBtn.dataset.range, 10);
    loadAnalytics();
    return;
  }
  const epEl = e.target.closest('[data-endpoint]');
  if (epEl) {
    const path = epEl.dataset.endpoint;
    const method = epEl.dataset.method;
    const eps = flattenEndpoints(apiSpec);
    selectedEp = eps.find(function (x) { return x.path === path && x.method === method; }) || selectedEp;
    apiResponse = null;
    renderView('apidocs');
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  if (action === 'report-generate') {
    generateReport();
    return;
  }
  if (action === 'export-download') {
    const source = document.getElementById('exportSource').value;
    const format = document.getElementById('exportFormat').value;
    const filters = currentExportFilters();
    downloadExport(source, format, filters ? '?' + filters : '');
    toast('Export started: ' + source + ' (' + format + ').');
    return;
  }
  if (action === 'export-bulk') {
    const format = document.getElementById('exportFormat') ? document.getElementById('exportFormat').value : 'csv';
    downloadExport('audit', format, '');
    downloadExport('analytics', format, '?days=30');
    downloadExport('users', format, '');
    downloadExport('config', 'json', '');
    toast('Bulk export started for all sources.');
    return;
  }
  if (action === 'export-template-save') {
    saveExportTemplate();
    return;
  }
  if (action === 'template-run') {
    const t = (state.templates.templates || []).find(function (x) { return x.id === id; });
    if (!t) return;
    downloadExport(t.source, t.format, t.filters);
    toast('Ran template "' + t.name + '".');
    loadAll();
    return;
  }
  if (action === 'template-delete') {
    apiJSON('DELETE', '/api/export-templates/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to delete template.', true); return; }
      toast('Template deleted.');
      loadAll();
    });
    return;
  }
  if (action === 'export-redownload') {
    downloadExport(actionEl.dataset.source, actionEl.dataset.format, actionEl.dataset.params);
    toast('Re-downloading export.');
    return;
  }
  if (action === 'export-delete') {
    apiJSON('DELETE', '/api/exports/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to delete export.', true); return; }
      toast('Export record deleted.');
      loadAll();
    });
    return;
  }
  if (action === 'exports-clear') {
    if (!confirm('Clear all export history? This cannot be undone.')) return;
    apiJSON('POST', '/api/exports/clear').then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to clear exports.', true); return; }
      toast('Export history cleared.');
      loadAll();
    });
    return;
  }
  if (action === 'api-send') {
    sendApiRequest();
    return;
  }
  if (action === 'org-create') {
    const content = document.getElementById('content');
    content.insertAdjacentHTML('afterbegin', orgForm('create', null));
    return;
  }
  if (action === 'org-edit') {
    const org = (state.orgs.organizations || []).find(o => o.id === id);
    if (!org) return;
    const content = document.getElementById('content');
    content.insertAdjacentHTML('afterbegin', orgForm('edit', org) + orgSettingsPanel(org));
    return;
  }
  if (action === 'org-form-cancel') {
    const form = document.querySelector('[data-form="org"]');
    if (form) form.closest('.panel').remove();
    const settings = document.querySelector('[data-form="org-settings"]');
    if (settings) settings.closest('.section').remove();
    return;
  }
  if (action === 'org-delete') {
    if (!confirm('Delete this organization? This cannot be undone.')) return;
    apiJSON('DELETE', '/api/orgs/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to delete organization.', true); return; }
      toast('Organization deleted.');
      loadAll();
    });
    return;
  }
  if (action === 'user-create') {
    const content = document.getElementById('content');
    content.insertAdjacentHTML('afterbegin', userForm('create', null));
    return;
  }
  if (action === 'user-edit') {
    const user = (state.users.users || []).find(u => u.userId === id);
    if (!user) return;
    const content = document.getElementById('content');
    content.insertAdjacentHTML('afterbegin', userForm('edit', user));
    return;
  }
  if (action === 'user-form-cancel') {
    const form = document.querySelector('[data-form="user"]');
    if (form) form.closest('.panel').remove();
    return;
  }
  if (action === 'user-deactivate') {
    if (!confirm('Deactivate this user? They will no longer be able to sign in.')) return;
    apiJSON('DELETE', '/api/users/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to deactivate.', true); return; }
      toast('User deactivated.');
      loadAll();
    });
    return;
  }
  if (action === 'user-reactivate') {
    apiJSON('PUT', '/api/users/' + encodeURIComponent(id), { status: 'active' }).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to reactivate.', true); return; }
      toast('User reactivated.');
      loadAll();
    });
    return;
  }
  if (action === 'license-deactivate') {
    if (!confirm('Deactivate the current license? The dashboard will return to community tier.')) return;
    apiJSON('POST', '/api/license/deactivate').then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to deactivate license.', true); return; }
      toast('License deactivated.');
      loadAll();
    });
    return;
  }
  if (action === 'license-validate') {
    apiJSON('GET', '/api/license/validate').then(function (r) {
      if (!r.ok) { toast('Validation failed.', true); return; }
      const seats = r.data.seats;
      toast('License valid. Seats: ' + seats.used + ' / ' + seats.total + '.');
    });
    return;
  }
  if (action === 'users-export') {
    const users = state.users && state.users.users ? state.users.users : [];
    const header = 'email,role,status,organization,joined';
    const rows = users.map(function (u) {
      return [u.email, u.role, u.status, u.orgName, u.joinedAt].map(function (c) {
        return '"' + String(c).replace(/"/g, '""') + '"';
      }).join(',');
    });
    const blob = new Blob([header + '\\n' + rows.join('\\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mtc-users.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  if (action === 'config-reset') {
    resetConfig();
    return;
  }
  if (action === 'config-export') {
    exportConfig();
    return;
  }
  if (action === 'config-validate') {
    validateConfigNow();
    return;
  }
  if (action === 'notif-mark-all') {
    apiJSON('POST', '/api/notifications/mark-all').then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to mark notifications.', true); return; }
      toast('All notifications marked as read.');
      loadAll();
    });
    return;
  }
  if (action === 'notif-clear') {
    if (!confirm('Clear all notifications? This cannot be undone.')) return;
    apiJSON('POST', '/api/notifications/clear').then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to clear notifications.', true); return; }
      toast('Notifications cleared.');
      loadAll();
    });
    return;
  }
  if (action === 'notif-create') {
    createTestNotification();
    return;
  }
  if (action === 'notif-read') {
    apiJSON('PUT', '/api/notifications/' + encodeURIComponent(id), { read: true }).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed.', true); return; }
      loadAll();
    });
    return;
  }
  if (action === 'notif-unread') {
    apiJSON('PUT', '/api/notifications/' + encodeURIComponent(id), { read: false }).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed.', true); return; }
      loadAll();
    });
    return;
  }
  if (action === 'notif-delete') {
    apiJSON('DELETE', '/api/notifications/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to delete.', true); return; }
      toast('Notification deleted.');
      loadAll();
    });
    return;
  }
  if (action === 'alert-resolve') {
    apiJSON('POST', '/api/security/alerts/' + encodeURIComponent(id) + '/resolve').then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to resolve alert.', true); return; }
      toast('Alert resolved.');
      loadAll();
    });
    return;
  }
  if (action === 'alert-delete') {
    apiJSON('DELETE', '/api/security/alerts/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to delete alert.', true); return; }
      toast('Alert deleted.');
      loadAll();
    });
    return;
  }
  if (action === 'alerts-clear') {
    if (!confirm('Clear all security alerts?')) return;
    apiJSON('POST', '/api/security/alerts/clear').then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to clear alerts.', true); return; }
      toast('Security alerts cleared.');
      loadAll();
    });
    return;
  }
  if (action === 'policy-save') {
    const key = actionEl.dataset.key;
    const input = document.querySelector('[data-policy-key="' + key + '"]');
    if (!input) return;
    let value = input.value;
    if (input.type === 'checkbox') value = input.checked;
    else if (!isNaN(Number(value))) value = Number(value);
    apiJSON('PUT', '/api/security/policies', { key: key, value: value }).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to save policy.', true); return; }
      toast('Policy updated.');
      loadAll();
    });
    return;
  }
  if (action === 'integrity-check') {
    loadAuditIntegrity();
    return;
  }
  if (action === 'compliance-report') {
    apiJSON('POST', '/api/compliance/report').then(function (r) {
      const pre = document.getElementById('complianceReport');
      const copy = document.querySelector('[data-action="compliance-report-copy"]');
      if (!pre) return;
      if (!r.ok) { pre.style.display = 'block'; pre.textContent = 'Report generation failed: ' + ((r.data && r.data.error) || r.status); return; }
      pre.style.display = 'block';
      pre.textContent = JSON.stringify(r.data, null, 2);
      if (copy) copy.style.display = '';
      toast('Compliance report generated.');
      loadAll();
    });
    return;
  }
  if (action === 'compliance-report-copy') {
    const pre = document.getElementById('complianceReport');
    if (!pre || !pre.textContent) return;
    navigator.clipboard.writeText(pre.textContent).then(function () {
      toast('Report copied to clipboard.');
    }).catch(function () {
      toast('Failed to copy report.', true);
    });
    return;
  }
  if (action === 'audit-filter-clear') {
    auditActorFilter = '';
    auditActionFilter = '';
    auditSinceFilter = '';
    auditUntilFilter = '';
    loadAudit();
    return;
  }
  if (action === 'role-new') {
    document.getElementById('content').insertAdjacentHTML('afterbegin', roleForm('create', null));
    return;
  }
  if (action === 'role-edit') {
    const role = (state.rbacRoles && state.rbacRoles.roles || []).find(r => r.id === id);
    if (!role) return;
    document.getElementById('content').insertAdjacentHTML('afterbegin', roleForm('edit', role));
    return;
  }
  if (action === 'role-form-cancel') {
    const form = document.querySelector('[data-form="rbac-role"]');
    if (form) form.closest('.section').remove();
    return;
  }
  if (action === 'role-clone') {
    const name = prompt('Clone role "' + actionEl.dataset.name + '" as:', actionEl.dataset.name + '-copy');
    if (!name) return;
    apiJSON('POST', '/api/rbac/roles/' + encodeURIComponent(id) + '/clone', { name: name }).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to clone role.', true); return; }
      toast('Role cloned.');
      loadAll();
    });
    return;
  }
  if (action === 'rbac-check-summary') {
    const form = document.querySelector('[data-form="rbac-check"]');
    if (!form) return;
    const userId = String(new FormData(form).get('userId') || '');
    const box = document.getElementById('rbacCheckResult');
    fetchJSON(API + '/rbac/check?userId=' + encodeURIComponent(userId)).then(function (r) {
      if (!box) return;
      const roles = (r.roles || []).map(function (x) { return x.name; });
      box.innerHTML = '<div class="kv-row"><span class="dim">Roles:</span> <span>' + (roles.length ? roles.map(esc).join(', ') : 'none') + '</span></div>' +
        '<div class="kv-row"><span class="dim">Effective permissions:</span> <span class="mono">' + esc((r.effectivePermissions || []).join(', ')) + '</span></div>';
    }).catch(function (err) {
      if (!box) return;
      box.innerHTML = '<div class="kv-row"><span class="pill chip-red">error</span> <span class="dim">' + esc(err.message) + '</span></div>';
    });
    return;
  }
  if (action === 'role-delete') {
    if (!confirm('Delete this role? Assignments will be removed.')) return;
    apiJSON('DELETE', '/api/rbac/roles/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to delete role.', true); return; }
      toast('Role deleted.');
      loadAll();
    });
    return;
  }
  if (action === 'role-unassign') {
    apiJSON('DELETE', '/api/rbac/assign', { userId: actionEl.dataset.user, roleId: actionEl.dataset.role }).then(function (r) {
      if (!r.ok) { toast((r.data && r.data.error) || 'Failed to unassign role.', true); return; }
      toast('Role unassigned.');
      loadAll();
    });
    return;
  }
});

document.addEventListener('input', function (e) {
  const search = e.target.closest('[data-search="users"]');
  if (search) {
    usersFilter = search.value;
    renderView('users');
    return;
  }
  const filter = e.target.closest('[data-filter="role"]');
  if (filter) {
    usersRoleFilter = filter.value;
    renderView('users');
    return;
  }
  const notifLevel = e.target.closest('[data-filter="notif-level"]');
  if (notifLevel) {
    notifLevelFilter = notifLevel.value;
    renderView('notifications');
    return;
  }
  const notifRead = e.target.closest('[data-filter="notif-read"]');
  if (notifRead) {
    notifReadFilter = notifRead.value;
    renderView('notifications');
  }
});

document.addEventListener('change', function (e) {
  const src = e.target.closest('#exportSource');
  if (src) {
    exportSource = src.value;
    const wrap = document.getElementById('exportFilters');
    if (wrap) wrap.innerHTML = exportFilterFields(exportSource);
    return;
  }
  const fmt = e.target.closest('#exportFormat');
  if (fmt) {
    exportFormat = fmt.value;
    return;
  }
  const sectionBox = e.target.closest('[data-report-section]');
  if (sectionBox) {
    const key = sectionBox.dataset.reportSection;
    const idx = reportInclude.indexOf(key);
    if (sectionBox.checked && idx === -1) reportInclude.push(key);
    if (!sectionBox.checked && idx !== -1) reportInclude.splice(idx, 1);
  }
});

async function submitLicenseActivate(form) {
  const errBox = form.querySelector('[data-form-error]');
  errBox.style.display = 'none';
  const key = String(form.querySelector('textarea[name="key"]').value || '').trim();
  if (!/^MTC-(enterprise-plus|enterprise)-/.test(key)) {
    errBox.textContent = 'Enter a valid license key (starts with MTC-enterprise or MTC-enterprise-plus).';
    errBox.style.display = 'block';
    return;
  }
  const r = await apiJSON('POST', '/api/license/activate', { key });
  if (!r.ok) {
    errBox.textContent = (r.data && r.data.error) || 'Activation failed.';
    errBox.style.display = 'block';
    return;
  }
  toast(r.data.upgraded ? 'License activated (upgraded).' : 'License activated.');
  await loadAll();
}

async function submitLicenseSeats(form) {
  const maxSeats = parseInt(form.querySelector('input[name="maxSeats"]').value, 10);
  if (!Number.isFinite(maxSeats) || maxSeats < 1) {
    toast('Seats must be a positive number.', true);
    return;
  }
  const r = await apiJSON('POST', '/api/license/seats', { maxSeats });
  if (!r.ok) {
    toast((r.data && r.data.error) || 'Failed to update seats.', true);
    return;
  }
  toast('Seats updated to ' + r.data.seats.total + '.');
  await loadAll();
}

async function submitConfigForm(form, shape) {
  const errBox = form.querySelector('[data-form-error]');
  errBox.style.display = 'none';
  const fd = new FormData(form);
  const config = {};
  const llm = {};

  if (shape === 'general') {
    config.organization = { name: String(fd.get('orgName') || '').trim() };
    if (fd.get('selectedModel')) config.selectedModel = fd.get('selectedModel');
    if (fd.get('agentId')) config.agentId = fd.get('agentId');
    if (fd.get('themeId')) config.themeId = fd.get('themeId');
  } else if (shape === 'auth') {
    if (fd.get('clientId')) config.auth = { clientId: fd.get('clientId') };
    if (fd.get('tenantId')) config.auth = { ...(config.auth || {}), tenantId: fd.get('tenantId') };
    const secret = String(fd.get('clientSecret') || '');
    if (secret && secret !== '********') config.auth = { ...(config.auth || {}), clientSecret: secret };
    if (fd.get('apiKey') && String(fd.get('apiKey')) !== '********') config.apiKey = fd.get('apiKey');
    if (fd.get('endpoint')) config.endpoint = fd.get('endpoint');
  } else if (shape === 'telemetry') {
    config.telemetry = {
      enabled: fd.get('telemetryEnabled') === 'true',
      endpoint: fd.get('telemetryEndpoint') ? fd.get('telemetryEndpoint') : undefined
    };
  } else if (shape === 'routing') {
    llm.routing = {
      simpleModel: fd.get('simpleModel'),
      defaultModel: fd.get('defaultModel'),
      reasoningModel: fd.get('reasoningModel')
    };
  }

  const payload = {};
  if (Object.keys(config).length) payload.config = config;
  if (Object.keys(llm).length) payload.llm = llm;

  const r = await apiJSON('PUT', '/api/config', payload);
  if (!r.ok) {
    const msg = (r.data && r.data.errors) ? r.data.errors.join('; ') : ((r.data && r.data.error) || 'Failed to save configuration.');
    errBox.textContent = msg;
    errBox.style.display = 'block';
    return;
  }
  toast('Configuration saved.');
  await loadAll();
}

async function resetConfig() {
  if (!confirm('Reset configuration to defaults? Current values will be overwritten.')) return;
  const r = await apiJSON('PUT', '/api/config', { config: {} });
  if (!r.ok) { toast((r.data && r.data.error) || 'Failed to reset configuration.', true); return; }
  toast('Configuration reset to defaults.');
  await loadAll();
}

async function validateConfigNow() {
  const r = await apiJSON('POST', '/api/config/validate', { config: {} });
  if (!r.ok) { toast('Configuration validation failed.', true); return; }
  toast('Configuration schema is valid.');
}

function exportConfig() {
  const cfg = state.config || {};
  const blob = new Blob([JSON.stringify({ config: cfg.config, llm: cfg.llm }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mtc-config.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function submitNotifPrefs(form) {
  const fd = new FormData(form);
  const errBox = form.querySelector('[data-form-error]');
  errBox.style.display = 'none';
  const payload = {
    emailEnabled: fd.get('emailEnabled') === 'true',
    slackEnabled: fd.get('slackEnabled') === 'true',
    minLevel: fd.get('minLevel') || 'info',
    webhookUrl: String(fd.get('webhookUrl') || '').trim() || undefined
  };
  const r = await apiJSON('PUT', '/api/notifications/preferences', payload);
  if (!r.ok) {
    errBox.textContent = (r.data && r.data.error) || 'Failed to save preferences.';
    errBox.style.display = 'block';
    return;
  }
  toast('Notification preferences saved.');
  await loadAll();
}

async function createTestNotification() {
  const r = await apiJSON('POST', '/api/notifications', {
    level: 'info',
    title: 'Test notification',
    message: 'This is a test notification from the dashboard.',
    source: 'dashboard'
  });
  if (!r.ok) { toast((r.data && r.data.error) || 'Failed to create notification.', true); return; }
  toast('Test notification created.');
  await loadAll();
}

document.addEventListener('submit', function (e) {
  const licActivate = e.target.closest('[data-form="license-activate"]');
  if (licActivate) {
    e.preventDefault();
    submitLicenseActivate(licActivate);
    return;
  }
  const licSeats = e.target.closest('[data-form="license-seats"]');
  if (licSeats) {
    e.preventDefault();
    submitLicenseSeats(licSeats);
    return;
  }
  const userFormEl = e.target.closest('[data-form="user"]');
  if (userFormEl) {
    e.preventDefault();
    submitUserForm(userFormEl);
    return;
  }
  const orgFormEl = e.target.closest('[data-form="org"]');
  if (orgFormEl) {
    e.preventDefault();
    submitOrgForm(orgFormEl);
    return;
  }
  const orgSettings = e.target.closest('[data-form="org-settings"]');
  if (orgSettings) {
    e.preventDefault();
    submitOrgSettings(orgSettings);
    return;
  }
  const configForm = e.target.closest('[data-form="config"]');
  if (configForm) {
    e.preventDefault();
    submitConfigForm(configForm, 'general');
    return;
  }
  const configAuth = e.target.closest('[data-form="config-auth"]');
  if (configAuth) {
    e.preventDefault();
    submitConfigForm(configAuth, 'auth');
    return;
  }
  const configTelemetry = e.target.closest('[data-form="config-telemetry"]');
  if (configTelemetry) {
    e.preventDefault();
    submitConfigForm(configTelemetry, 'telemetry');
    return;
  }
  const configRouting = e.target.closest('[data-form="config-routing"]');
  if (configRouting) {
    e.preventDefault();
    submitConfigForm(configRouting, 'routing');
    return;
  }
  const notifPrefs = e.target.closest('[data-form="notif-prefs"]');
  if (notifPrefs) {
    e.preventDefault();
    submitNotifPrefs(notifPrefs);
  }
  const rbacRoleForm = e.target.closest('[data-form="rbac-role"]');
  if (rbacRoleForm) {
    e.preventDefault();
    submitRoleForm(rbacRoleForm);
    return;
  }
  const rbacAssign = e.target.closest('[data-form="rbac-assign"]');
  if (rbacAssign) {
    e.preventDefault();
    const fd = new FormData(rbacAssign);
    const errBox = rbacAssign.querySelector('[data-form-error]');
    errBox.style.display = 'none';
    apiJSON('POST', '/api/rbac/assign', { userId: fd.get('userId'), roleId: fd.get('roleId') }).then(function (r) {
      if (!r.ok) { errBox.textContent = (r.data && r.data.error) || 'Assignment failed.'; errBox.style.display = 'block'; return; }
      toast('Role assigned.');
      loadAll();
    });
  }
  const auditFilter = e.target.closest('[data-form="audit-filter"]');
  if (auditFilter) {
    e.preventDefault();
    applyAuditFilter(auditFilter);
  }
  const rbacCheck = e.target.closest('[data-form="rbac-check"]');
  if (rbacCheck) {
    e.preventDefault();
    const fd = new FormData(rbacCheck);
    const errBox = rbacCheck.querySelector('[data-form-error]');
    errBox.style.display = 'none';
    const box = document.getElementById('rbacCheckResult');
    fetchJSON(API + '/rbac/check?userId=' + encodeURIComponent(String(fd.get('userId') || '')) + '&permission=' + encodeURIComponent(String(fd.get('permission') || ''))).then(function (r) {
      if (!box) return;
      if (!r.allowed) {
        box.innerHTML = '<div class="kv-row"><span class="pill chip-red">denied</span> <span class="dim">' + esc(String(fd.get('permission'))) + ' is not granted to this user.</span></div>';
        return;
      }
      box.innerHTML = '<div class="kv-row"><span class="pill chip-green">allowed</span> <span class="dim">' + esc(String(fd.get('permission'))) + ' is granted.</span></div>';
    }).catch(function (err) {
      if (!box) return;
      box.innerHTML = '<div class="kv-row"><span class="pill chip-red">error</span> <span class="dim">' + esc(err.message) + '</span></div>';
    });
  }
});

loadAll();
setInterval(loadAll, 30000);

/* ---- real-time via WebSocket ---- */
(function () {
  var ws = null;
  var reconnectDelay = 3000;
  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/ws');
    ws.onopen = function () { reconnectDelay = 3000; };
    ws.onmessage = function (ev) {
      var msg = null;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || !msg.type) return;
      if (msg.type === 'health') {
        var sys = document.querySelector('.sidebar-foot .sys-item');
        if (sys) sys.innerHTML = '<span class="status ok"></span>Live — ' + (msg.sessions || 0) + ' sessions';
        return;
      }
      if (msg.type === 'audit') {
        if (state.audit) {
          state.audit.logs = [msg.event].concat(state.audit.logs || []).slice(0, 50);
          if (getActiveView() === 'audit') renderView('audit');
        }
        return;
      }
      if (msg.type === 'notify') {
        if (state.notifications) {
          state.notifications.notifications = [msg].concat(state.notifications.notifications || []).slice(0, 100);
          var badge = document.getElementById('notifBadge');
          if (badge) {
            var unread = (state.notifications.notifications || []).filter(function (n) { return !n.read; }).length;
            if (unread > 0) { badge.textContent = unread > 99 ? '99+' : unread; badge.style.display = 'inline-flex'; }
            else badge.style.display = 'none';
          }
          toast(msg.level === 'critical' ? msg.title + ': ' + msg.message : msg.title, msg.level === 'critical');
          if (getActiveView() === 'notifications') renderView('notifications');
        }
        return;
      }
      if (msg.type === 'sessions' || msg.type === 'license' || msg.type === 'status') {
        loadAll();
        return;
      }
      if (msg.type === 'subscribed' || msg.type === 'hello' || msg.type === 'pong') return;
    };
    ws.onclose = function () {
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }
  connect();
})();
</script>
</body>
</html>`;
