# Commercialization & Enterprise Edition

Packaging **mtc** as a commercial B2B product with tiered licensing,
an admin control plane, and enterprise compliance features.

---

## Commercial Tiering

| Feature | Community | Enterprise | Enterprise+ |
|---------|-----------|------------|-------------|
| CLI & core tools | Free | Free | Free |
| Custom agents | Free | Free | Free |
| MCP integrations | Free | Free | Free |
| Web dashboard | - | Included | Included |
| Audit logs | - | Included | Included |
| Team analytics | - | Included | Included |
| RBAC | - | Included | Included |
| Slack integration | - | Included | Included |
| SSO / SAML | - | - | Included |
| SOC2 compliance | - | - | Included |
| Hosted fine-tuned models | - | - | Included |
| Priority support | - | - | Included |
| On-prem deployment | - | - | Included |
| License server | - | - | Included |
| Max seats | 1 | 50 | 500+ |

---

## Enterprise Control Plane

The web dashboard provides a centralized admin interface:

```bash
mtc enterprise dashboard --port 3000
```

Open `http://localhost:3000` in your browser.

### Dashboard Sections

| Section | Description |
|---------|-------------|
| **Overview** | System status, feature availability, license info |
| **License** | License details, seat usage, expiration, feature list, activation wizard |
| **Audit Logs** | Searchable event history with actor/action/resource, live streaming |
| **Analytics** | 30-day usage report: sessions, tokens, model usage, tool success rates |
| **Organizations** | Multi-tenant org management with member/settings editing |
| **Users** | User CRUD, roles, deactivation, search, CSV export |
| **Sessions** | Live session monitoring (messages, token usage) |
| **Notifications** | Alert center with levels, filters, preferences, and webhook delivery |
| **Configuration** | Schema-driven editor for auth, telemetry, routing, and providers |
| **Connections** | MCP server status and agent inventory |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | System status and feature flags |
| `GET /api/license` | License information |
| `GET /api/license/validate` | Real-time license validation with seat usage |
| `POST /api/license/activate` | Activate a license key |
| `POST /api/license/deactivate` | Deactivate the current license |
| `POST /api/license/seats` | Adjust license seats (requires `MTC_LICENSE_SECRET`) |
| `GET /api/audit` | Audit log entries (paginated) |
| `GET /api/analytics` | 30-day usage report |
| `GET /api/orgs` | Organization list |
| `POST /api/orgs/create` | Create an organization |
| `PUT /api/orgs/:orgId` | Update an organization or its settings |
| `DELETE /api/orgs/:orgId` | Delete an organization (cascade) |
| `GET /api/users` | User list |
| `POST /api/users/create` | Create a user |
| `PUT /api/users/:userId` | Update a user (role/status/email) |
| `DELETE /api/users/:userId` | Deactivate a user |
| `GET /api/sessions` | Recent agent sessions |
| `GET/POST /api/notifications` | List or create notifications |
| `PUT/DELETE /api/notifications/:id` | Update or delete a notification |
| `POST /api/notifications/mark-all` | Mark all notifications read |
| `POST /api/notifications/clear` | Clear notifications |
| `GET/PUT /api/notifications/preferences` | Notification delivery preferences |
| `GET/PUT /api/config` | Read or update runtime configuration |
| `GET /api/config/schema` | Configuration schema (drives the editor) |
| `POST /api/config/validate` | Validate a configuration patch |
| `GET /api/config/defaults` | Default configuration values |
| `GET /api/servers` | Connected MCP servers |
| `GET /api/agents` | Available agents |
| `GET /api/health` | Health check |
| `WS /ws` | WebSocket for real-time updates (audit, license, sessions, notifications, health) |

---

## License Management

### CLI Commands

```bash
# View current license status
mtc enterprise status

# Activate an enterprise license key
mtc enterprise activate MTC-ENTERPRISE-XXXX-XXXX

# Deactivate license (revert to community)
mtc enterprise deactivate

# Generate a license key (admin only)
mtc enterprise generate --tier enterprise --org "Acme Corp"

# Start the web dashboard
mtc enterprise dashboard --port 3000

# View audit logs
mtc enterprise audit --limit 50

# Manage organizations
mtc enterprise org list
mtc enterprise org create "Acme Corp" acme-corp
```

### License Key Format

```
MTC-{TIER}-{ORG}-{SIGNATURE}
```

- `TIER` — `COMMUNITY`, `ENTERPRISE`, or `ENTERPRISE_PLUS`
- `ORG` — organization slug (max 8 chars)
- `SIGNATURE` — 16 hex chars (HMAC-SHA256 over `tier:org:expiresAt:maxSeats`),
  hyphenated in 4-char groups

Example: `MTC-ENTERPRISE-ACME-1A2B3C4D-5E6F7A8B`

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MTC_LICENSE_SECRET` | HMAC secret used to sign and verify license keys. If unset, generated keys are **not** signature-verified (a warning is shown) — set it in production |

### Feature Gating

All enterprise features are gated behind license checks:

```typescript
import { hasFeature, gateEnterprise } from "./enterprise/index";

// Soft check
if (hasFeature("audit_logs")) {
  // enable audit logging
}

// Hard gate (throws if not licensed)
gateEnterprise("web_dashboard");
```

---

## Audit Logging

Enterprise audit logs capture all significant events:

| Field | Description |
|-------|-------------|
| `id` | Unique event ID |
| `timestamp` | ISO 8601 timestamp |
| `actor` | User who performed the action |
| `action` | Action type (session.start, tool.call, license.activate, etc.) |
| `resource` | Resource affected |
| `detail` | Human-readable description |
| `ip` | Source IP address |
| `sessionId` | MTC session ID |

### Retention

Audit logs are retained for 90 days by default (configurable via org settings).
Clear old logs:

```bash
# Clear logs older than 30 days
# Uses the retention setting in organization settings
```

---

## Organization Management

Multi-tenant support for enterprise deployments:

```bash
# Create an organization
mtc enterprise org create "Acme Corp" acme-corp

# List organizations
mtc enterprise org list
```

Each organization has:
- Isolated settings (SSO, audit retention, allowed domains)
- Role-based access (admin, member, viewer)
- Seat count tracking against license limits

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Enterprise Client                         │
│  mtc CLI  │  VS Code  │  CI/CD  │  Dashboard (Browser)     │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  mtc Core                                       │
│  Agents  │  Tools  │  MCP  │  Session  │  LLM Routing       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│               Enterprise Layer                                  │
│  License  │  Audit  │  Org Mgmt  │  Tier Gating             │
│  Validator│  Logger │  RBAC      │  Feature Flags           │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│               Storage (SQLite / PostgreSQL)                    │
│  Config  │  Sessions  │  Audit  │  Orgs  │  Telemetry       │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Options

### Self-Hosted (On-Prem)

```bash
# Start everything
mtc enterprise dashboard --port 3000 --host 0.0.0.0
```

### Docker

```dockerfile
FROM oven/bun:latest
COPY . /app
WORKDIR /app
RUN bun install
EXPOSE 3000
CMD ["bun", "run", "src/cli.tsx", "enterprise", "dashboard", "--port", "3000"]
```

## SOC2 Compliance

Enterprise+ tier includes:

- **Access control** — RBAC with SSO/SAML integration
- **Audit trail** — Immutable audit log of all operations
- **Data encryption** — SQLite at rest, TLS in transit
- **Availability** — Health check endpoints, monitoring integration
- **Change management** — All tool operations logged with before/after state

## Enterprise CLI Reference

```bash
mtc enterprise status                      # Tier, license, seats, features
mtc enterprise activate <key>              # Activate a license key
mtc enterprise deactivate                  # Revert to community tier
mtc enterprise generate -t enterprise -o ACME   # Issue a key (needs MTC_LICENSE_SECRET)
mtc enterprise dashboard -p 3000 -H 127.0.0.1   # Web control plane
mtc enterprise audit -l 50 -a <actor> -s <date> # Audit logs
mtc enterprise org list | create <name> <slug>  # Organization management
```
