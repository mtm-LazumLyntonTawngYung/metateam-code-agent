/**
 * PROPRIETARY — MetaTeam Technologies
 *
 * This file is part of the Enterprise Edition of Metateam Code Agent.
 * It is NOT licensed under the MIT License.
 * Commercial license required. See LICENSE.ENTERPRISE or contact
 * legal@metateam.io for terms.
 */

import { getLicense, formatLicenseInfo } from "./license";
import { queryAuditLogs, getAuditStats } from "./audit";
import { listOrganizations, getOrganization } from "./org";
import { getAllUsers } from "./user";
import { getSystemStatus } from "./tier";
import { getConnectedServers } from "../mcp/index";
import { getAllAgents } from "../agents/index";
import { generateReport } from "../telemetry/reporter";
import { isTelemetryEnabled } from "../telemetry/store";

export function startDashboard(port: number, host: string = "127.0.0.1"): void {
  console.error(`mtc enterprise dashboard: http://${host}:${port}`);

  Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/" || path === "/index.html") {
        return new Response(DASHBOARD_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (path === "/api/status") {
        return jsonResponse(getSystemStatus());
      }

      if (path === "/api/license") {
        return jsonResponse({ license: getLicense(), formatted: formatLicenseInfo(getLicense()) });
      }

      if (path === "/api/audit") {
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const logs = queryAuditLogs({ limit, offset });
        const stats = getAuditStats();
        return jsonResponse({ logs, stats });
      }

      if (path === "/api/orgs") {
        const orgs = listOrganizations();
        return jsonResponse({ organizations: orgs });
      }

      if (path === "/api/users") {
        const users = getAllUsers();
        return jsonResponse({ users });
      }

      if (path === "/api/servers") {
        return jsonResponse({ servers: getConnectedServers() });
      }

      if (path === "/api/agents") {
        return jsonResponse({ agents: getAllAgents().map((a) => ({ id: a.id, name: a.name, mode: a.mode })) });
      }

      if (path === "/api/analytics") {
        const report = generateReport(30);
        return jsonResponse({ report });
      }

      if (path === "/api/health") {
        return jsonResponse({ status: "ok", timestamp: new Date().toISOString(), telemetry: isTelemetryEnabled() });
      }

      return new Response("Not found", { status: 404 });
    },
  });
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

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

  .empty { padding: 28px; text-align: center; color: var(--text-muted); font-size: 13px; }
  .loading { display: flex; align-items: center; justify-content: center; min-height: 60vh; color: var(--text-muted); font-size: 14px; gap: 12px; }
  .loading::before {
    content: ''; width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid var(--surface-3); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { margin: 40px auto; max-width: 520px; padding: 18px 20px; border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.08); color: var(--red); border-radius: 12px; font-size: 13px; }

  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { display: none; }
    .mobile-nav { display: flex; }
    .main { padding: 20px 16px; }
    .page-header { flex-direction: column; gap: 12px; }
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
      <li data-view="organizations">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M10 22v-6h4v6"/><path d="M3 22h18"/></svg>
        <span>Organizations</span>
      </li>
      <li data-view="users">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5 6.5-5s6 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M19 15c1.5.5 2.5 2 2.5 5"/></svg>
        <span>Users</span>
      </li>
      <li data-view="servers">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>
        <span>Connections</span>
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

let state = { status: null, license: null, audit: null, analytics: null, orgs: null, servers: null, agents: null, users: null };

/* ---- helpers ---- */
function stat(label, value, chip, icon) {
  return '<div class="stat">' +
    '<div class="stat-icon ' + chip + '">' + (icon || '') + '</div>' +
    '<div class="stat-label">' + label + '</div>' +
    '<div class="stat-value">' + value + '</div>' +
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
  return '<span class="badge tier ' + tier + '">' + tier + '</span>';
}

function featureGrid(features) {
  if (!features || !features.length) return '<div class="empty">No features available.</div>';
  return '<div class="feature-grid">' + features.map(function (f) {
    var ok = !!f.available;
    return '<div class="feature-item">' +
      '<span class="icon" style="color:' + (ok ? 'var(--green)' : 'var(--text-faint)') + '">' + (ok ? IC.check : IC.x) + '</span>' +
      '<span>' + f.feature.replace(/_/g, ' ') + '</span>' +
      '<span class="tier">' + f.tier + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

function pillList(items) {
  if (!items || !items.length) return '<div class="empty">No enterprise features (community tier).</div>';
  return '<div class="pill-list">' + items.map(function (i) {
    return '<span class="pill">' + i.replace(/_/g, ' ') + '</span>';
  }).join('') + '</div>';
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
  return pageHeader('License', 'Enterprise licensing details', tierBadge(lic.tier)) +
    stats([
      stat('Status', lic.status, lic.status === 'active' ? 'chip-green' : 'chip-red', lic.status === 'active' ? IC.check : IC.x),
      stat('Seats', lic.currentSeats + ' / ' + lic.maxSeats, 'chip-blue', IC.users),
      stat('Expires', lic.expiresAt ? lic.expiresAt.slice(0, 10) : 'N/A', 'chip-yellow', IC.clock),
      stat('Organization', lic.organization, 'chip-purple', IC.building)
    ]) +
    section('License Details', null, '<div class="license-box">' + l.formatted + '</div>', true) +
    section('Enterprise Features', feats.length + ' features', pillList(feats), true);
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
      table(['Action', 'Count'], statsData.topActions.map(act => [act.action, '<span class="mono">' + act.count + '</span>'])));
  }
  html += section('Recent Events', logs.length + ' events',
    logs.length
      ? table(['Time', 'Actor', 'Action', 'Resource', 'Detail'], logs.map(log => [
          '<span class="mono">' + new Date(log.timestamp).toLocaleString() + '</span>',
          log.actor,
          '<span class="pill">' + log.action + '</span>',
          log.resource,
          '<span class="dim">' + log.detail + '</span>'
        ]))
      : '<div class="empty">No audit events recorded yet.</div>');
  return html;
}

function renderAnalytics() {
  const r = state.analytics && state.analytics.report;
  if (!r) return '<div class="loading">Loading&hellip;</div>';
  let html = pageHeader('Analytics', 'Usage across the last 30 days');
  html += stats([
    stat('Total Sessions', r.totalSessions || 0, 'chip-blue', IC.play),
    stat('Tool Calls', r.totalToolCalls || 0, 'chip-accent', IC.terminal),
    stat('Total Tokens', (r.totalTokens || 0).toLocaleString(), 'chip-yellow', IC.coins),
    stat('Active Devices', r.activeDevices || 0, 'chip-green', IC.monitor)
  ]);
  if (r.modelStats && r.modelStats.length) {
    html += section('Model Usage', r.modelStats.length + ' models',
      table(['Model', 'Tokens', 'Calls'], r.modelStats.map(m => [
        m.model,
        '<span class="mono">' + (m.total_tokens || 0).toLocaleString() + '</span>',
        '<span class="mono">' + (m.call_count || 0) + '</span>'
      ])));
  }
  if (r.toolStats && r.toolStats.length) {
    html += section('Tool Usage', r.toolStats.length + ' tools',
      table(['Tool', 'Calls', 'Success Rate'], r.toolStats.map(t => [
        t.tool_name,
        '<span class="mono">' + t.call_count + '</span>',
        (100 - (t.failure_rate || 0)).toFixed(0) + '%'
      ])));
  }
  return html;
}

function renderOrganizations() {
  const o = state.orgs;
  if (!o) return '<div class="loading">Loading&hellip;</div>';
  const orgs = o.organizations || [];
  return pageHeader('Organizations', 'Tenants managed by this control plane') +
    section('Organizations', orgs.length + ' orgs',
      orgs.length
        ? table(['Name', 'Slug', 'Tier', 'Created'], orgs.map(org => [
            org.name,
            '<span class="mono">' + org.slug + '</span>',
            tierBadge(org.tier),
            new Date(org.createdAt).toLocaleDateString()
          ]))
        : '<div class="empty">No organizations configured.</div>');
}

function rolePill(role) {
  const color = role === 'admin' ? 'var(--accent)' : role === 'viewer' ? 'var(--text-muted)' : 'var(--green)';
  return '<span class="pill" style="color:' + color + '">' + role + '</span>';
}

function fmtLastActive(value) {
  if (!value) return '<span class="dim">Never</span>';
  const t = new Date(value).getTime();
  if (isNaN(t)) return '<span class="dim">' + value + '</span>';
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < day) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 7 * day) return Math.floor(diff / day) + 'd ago';
  return new Date(value).toLocaleDateString();
}

function renderUsers() {
  const u = state.users;
  if (!u) return '<div class="loading">Loading&hellip;</div>';
  const users = u.users || [];
  return pageHeader('Users', 'All TUI users and their organizations') +
    section('Users', users.length + ' users',
      users.length
        ? table(['Email', 'Organization', 'Role', 'Last Active', 'Joined'], users.map(user => [
            user.email,
            user.orgName + '<div class="dim">' + user.orgSlug + '</div>',
            rolePill(user.role),
            fmtLastActive(user.lastActiveAt),
            new Date(user.joinedAt).toLocaleDateString()
          ]))
        : '<div class="empty">No users found.</div>');
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
      ? table(['Name', 'Status'], servers.map(name => [name, '<span class="status ok">Connected</span>']))
      : '<div class="empty">No MCP servers connected.</div>');
  html += section('Available Agents', agents.length + ' agents',
    agents.length
      ? table(['ID', 'Name', 'Mode'], agents.map(agent => [
          '<span class="mono">' + agent.id + '</span>',
          agent.name,
          '<span class="pill">' + agent.mode + '</span>'
        ]))
      : '<div class="empty">No agents available.</div>');
  return html;
}

/* ---- boot ---- */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadAll() {
  try {
    const [status, license, audit, analytics, orgs, servers, agents, users] = await Promise.all([
      fetchJSON(API + '/status'),
      fetchJSON(API + '/license'),
      fetchJSON(API + '/audit'),
      fetchJSON(API + '/analytics'),
      fetchJSON(API + '/orgs'),
      fetchJSON(API + '/servers'),
      fetchJSON(API + '/agents'),
      fetchJSON(API + '/users')
    ]);
    state = { status, license, audit, analytics, orgs, servers, agents, users };
    renderView(getActiveView());
  } catch (err) {
    document.getElementById('content').innerHTML = '<div class="error">Failed to load dashboard: ' + err.message + '</div>';
  }
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
  }
}

(function initMobileNav() {
  const m = document.getElementById('mobileNav');
  if (m) m.innerHTML = '<div class="brand-mark">M</div>' + document.querySelector('.sidebar .nav').innerHTML;
})();

document.addEventListener('click', function (e) {
  const li = e.target.closest('.nav li');
  if (!li) return;
  document.querySelectorAll('.nav li').forEach(l => l.classList.remove('active'));
  li.classList.add('active');
  renderView(li.dataset.view);
});

loadAll();
setInterval(loadAll, 30000);
</script>
</body>
</html>`;
