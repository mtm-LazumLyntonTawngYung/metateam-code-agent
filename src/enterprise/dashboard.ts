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
<title>MTC Enterprise Control Plane</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface-2: #242736;
    --border: #2a2d3a;
    --text: #e1e4ed;
    --text-muted: #8b8fa3;
    --green: #22c55e;
    --yellow: #eab308;
    --red: #ef4444;
    --blue: #3b82f6;
    --purple: #8b5cf6;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
  .sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 24px 16px; }
  .sidebar h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.3px; }
  .sidebar .subtitle { font-size: 12px; color: var(--text-muted); margin-bottom: 24px; }
  .nav { list-style: none; }
  .nav li { padding: 10px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; color: var(--text-muted); margin-bottom: 2px; transition: all 0.15s; }
  .nav li:hover { background: var(--surface-2); color: var(--text); }
  .nav li.active { background: var(--blue); color: white; }
  .main { padding: 32px; overflow-y: auto; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
  .header h2 { font-size: 24px; font-weight: 600; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
  .badge.community { background: rgba(139, 143, 163, 0.15); color: var(--text-muted); }
  .badge.enterprise { background: rgba(59, 130, 246, 0.15); color: var(--blue); }
  .badge.enterprise-plus { background: rgba(139, 92, 246, 0.15); color: var(--purple); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .card h3 { font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .card .value { font-size: 28px; font-weight: 700; }
  .card .value.green { color: var(--green); }
  .card .value.yellow { color: var(--yellow); }
  .card .value.red { color: var(--red); }
  .card .value.blue { color: var(--blue); }
  .section { margin-bottom: 32px; }
  .section h3 { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
  td { padding: 10px 12px; font-size: 14px; border-bottom: 1px solid var(--border); }
  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
  .status-dot.active { background: var(--green); }
  .status-dot.inactive { background: var(--text-muted); }
  .feature-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .feature-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface-2); border-radius: 6px; font-size: 13px; }
  .feature-item .icon { font-size: 16px; }
  .license-box { background: var(--surface-2); border-radius: 8px; padding: 16px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  .loading { text-align: center; padding: 48px; color: var(--text-muted); }
  error { color: var(--red); padding: 16px; }
  @media (max-width: 768px) { .layout { grid-template-columns: 1fr; } .sidebar { display: none; } }
</style>
</head>
<body>
<div class="layout">
  <nav class="sidebar">
    <h1>MTC</h1>
    <div class="subtitle">Enterprise Control Plane</div>
    <ul class="nav">
      <li class="active" data-view="overview">Overview</li>
      <li data-view="license">License</li>
      <li data-view="audit">Audit Logs</li>
      <li data-view="analytics">Analytics</li>
      <li data-view="organizations">Organizations</li>
      <li data-view="servers">Connections</li>
    </ul>
  </nav>
  <main class="main" id="content">
    <div class="loading">Loading...</div>
  </main>
</div>

<script>
const API = '/api';
let state = { status: null, license: null, audit: null, analytics: null, orgs: null, servers: null, agents: null };

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadAll() {
  try {
    const [status, license, audit, analytics, orgs, servers, agents] = await Promise.all([
      fetchJSON(API + '/status'),
      fetchJSON(API + '/license'),
      fetchJSON(API + '/audit'),
      fetchJSON(API + '/analytics'),
      fetchJSON(API + '/orgs'),
      fetchJSON(API + '/servers'),
      fetchJSON(API + '/agents'),
    ]);
    state = { status, license, audit, analytics, orgs, servers, agents };
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
    case 'servers': content.innerHTML = renderServers(); break;
  }
}

function renderOverview() {
  const s = state.status;
  if (!s) return '<div class="loading">Loading...</div>';
  const tierBadge = '<span class="badge ' + s.tier + '">' + s.tier + '</span>';
  return \`
    <div class="header">
      <h2>Overview</h2>
      \${tierBadge}
    </div>
    <div class="cards">
      <div class="card">
        <h3>License Status</h3>
        <div class="value \${s.licenseStatus === 'active' ? 'green' : 'red'}">\${s.licenseStatus}</div>
      </div>
      <div class="card">
        <h3>MCP Connections</h3>
        <div class="value blue">\${s.connectedMcpServers}</div>
      </div>
      <div class="card">
        <h3>Active Agents</h3>
        <div class="value blue">\${state.agents?.agents?.length ?? 0}</div>
      </div>
      <div class="card">
        <h3>Features Available</h3>
        <div class="value green">\${s.features?.filter(f => f.available).length ?? 0} / \${s.features?.length ?? 0}</div>
      </div>
    </div>
    <div class="section">
      <h3>Feature Availability</h3>
      <div class="feature-grid">
        \${(s.features ?? []).map(f => \`
          <div class="feature-item">
            <span class="icon">\${f.available ? '\u2705' : '\u274C'}</span>
            <span>\${f.feature.replace(/_/g, ' ')}</span>
            <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">\${f.tier}</span>
          </div>
        \`).join('')}
      </div>
    </div>
  \`;
}

function renderLicense() {
  const l = state.license;
  if (!l) return '<div class="loading">Loading...</div>';
  const tierBadge = '<span class="badge ' + l.license.tier + '">' + l.license.tier + '</span>';
  return \`
    <div class="header">
      <h2>License</h2>
      \${tierBadge}
    </div>
    <div class="cards">
      <div class="card">
        <h3>Status</h3>
        <div class="value \${l.license.status === 'active' ? 'green' : 'red'}">\${l.license.status}</div>
      </div>
      <div class="card">
        <h3>Seats</h3>
        <div class="value blue">\${l.license.currentSeats} / \${l.license.maxSeats}</div>
      </div>
      <div class="card">
        <h3>Expires</h3>
        <div class="value yellow">\${l.license.expiresAt?.slice(0, 10) ?? 'N/A'}</div>
      </div>
      <div class="card">
        <h3>Organization</h3>
        <div class="value">\${l.license.organization}</div>
      </div>
    </div>
    <div class="section">
      <h3>License Details</h3>
      <div class="license-box">\${l.formatted}</div>
    </div>
    <div class="section">
      <h3>Enterprise Features</h3>
      <div class="feature-grid">
        \${(l.license.features ?? []).map(f => \`
          <div class="feature-item">
            <span class="icon">\u2705</span>
            <span>\${f.replace(/_/g, ' ')}</span>
          </div>
        \`).join('')}
        \${l.license.features?.length === 0 ? '<div style="color:var(--text-muted);padding:8px">No enterprise features (community tier)</div>' : ''}
      </div>
    </div>
  \`;
}

function renderAudit() {
  const a = state.audit;
  if (!a) return '<div class="loading">Loading...</div>';
  return \`
    <div class="header"><h2>Audit Logs</h2></div>
    <div class="cards">
      <div class="card"><h3>Total Events</h3><div class="value blue">\${a.stats?.total ?? 0}</div></div>
      <div class="card"><h3>Unique Actors</h3><div class="value blue">\${a.stats?.uniqueActors ?? 0}</div></div>
    </div>
    \${a.stats?.topActions?.length ? \`
      <div class="section">
        <h3>Top Actions</h3>
        <table>
          <tr><th>Action</th><th>Count</th></tr>
          \${a.stats.topActions.map(act => \`<tr><td>\${act.action}</td><td>\${act.count}</td></tr>\`).join('')}
        </table>
      </div>
    \` : ''}
    <div class="section">
      <h3>Recent Events</h3>
      \${a.logs?.length ? \`
        <table>
          <tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Detail</th></tr>
          \${a.logs.map(log => \`
            <tr>
              <td style="white-space:nowrap">\${new Date(log.timestamp).toLocaleString()}</td>
              <td>\${log.actor}</td>
              <td><span class="badge" style="background:var(--surface-2);padding:2px 8px">\${log.action}</span></td>
              <td>\${log.resource}</td>
              <td style="color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis">\${log.detail}</td>
            </tr>
          \`).join('')}
        </table>
      \` : '<div style="color:var(--text-muted)">No audit events recorded yet.</div>'}
    </div>
  \`;
}

function renderAnalytics() {
  const r = state.analytics?.report;
  if (!r) return '<div class="loading">Loading...</div>';
  return \`
    <div class="header"><h2>Analytics (30 days)</h2></div>
    <div class="cards">
      <div class="card"><h3>Total Sessions</h3><div class="value blue">\${r.totalSessions ?? 0}</div></div>
      <div class="card"><h3>Tool Calls</h3><div class="value blue">\${r.totalToolCalls ?? 0}</div></div>
      <div class="card"><h3>Total Tokens</h3><div class="value yellow">\${(r.totalTokens ?? 0).toLocaleString()}</div></div>
      <div class="card"><h3>Active Devices</h3><div class="value green">\${r.activeDevices ?? 0}</div></div>
    </div>
    \${r.modelStats?.length ? \`
      <div class="section">
        <h3>Model Usage</h3>
        <table>
          <tr><th>Model</th><th>Tokens</th><th>Calls</th></tr>
          \${r.modelStats.map(m => \`<tr><td>\${m.model}</td><td>\${(m.tokens ?? 0).toLocaleString()}</td><td>\${m.calls ?? 0}</td></tr>\`).join('')}
        </table>
      </div>
    \` : ''}
    \${r.toolStats?.length ? \`
      <div class="section">
        <h3>Tool Usage</h3>
        <table>
          <tr><th>Tool</th><th>Calls</th><th>Success Rate</th></tr>
          \${r.toolStats.map(t => \`<tr><td>\${t.tool}</td><td>\${t.calls}</td><td>\${t.successRate ? (t.successRate * 100).toFixed(0) : 0}%</td></tr>\`).join('')}
        </table>
      </div>
    \` : ''}
  \`;
}

function renderOrganizations() {
  const o = state.orgs;
  if (!o) return '<div class="loading">Loading...</div>';
  return \`
    <div class="header"><h2>Organizations</h2></div>
    \${o.organizations?.length ? \`
      <table>
        <tr><th>Name</th><th>Slug</th><th>Tier</th><th>Created</th></tr>
        \${o.organizations.map(org => \`
          <tr>
            <td>\${org.name}</td>
            <td>\${org.slug}</td>
            <td><span class="badge \${org.tier}">\${org.tier}</span></td>
            <td>\${new Date(org.createdAt).toLocaleDateString()}</td>
          </tr>
        \`).join('')}
      </table>
    \` : '<div style="color:var(--text-muted)">No organizations configured.</div>'}
  \`;
}

function renderServers() {
  const s = state.servers;
  const a = state.agents;
  return \`
    <div class="header"><h2>Connections</h2></div>
    <div class="cards">
      <div class="card"><h3>MCP Servers</h3><div class="value blue">\${s?.servers?.length ?? 0}</div></div>
      <div class="card"><h3>Agents</h3><div class="value blue">\${a?.agents?.length ?? 0}</div></div>
    </div>
    \${s?.servers?.length ? \`
      <div class="section">
        <h3>Connected MCP Servers</h3>
        <table>
          <tr><th>Name</th><th>Status</th></tr>
          \${s.servers.map(name => \`<tr><td>\${name}</td><td><span class="status-dot active"></span>Connected</td></tr>\`).join('')}
        </table>
      </div>
    \` : ''}
    \${a?.agents?.length ? \`
      <div class="section">
        <h3>Available Agents</h3>
        <table>
          <tr><th>ID</th><th>Name</th><th>Mode</th></tr>
          \${a.agents.map(agent => \`<tr><td>\${agent.id}</td><td>\${agent.name}</td><td><span class="badge" style="background:var(--surface-2)">\${agent.mode}</span></td></tr>\`).join('')}
        </table>
      </div>
    \` : ''}
  \`;
}

document.querySelector('.nav').addEventListener('click', function(e) {
  const li = e.target.closest('li');
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
