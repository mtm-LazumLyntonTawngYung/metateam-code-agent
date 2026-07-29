# Platform Governance

Defines ownership, maintenance responsibilities, security policies, and
approval processes for the **mtc** platform.

---

## Ownership Model

| Role | Responsibility | Individual/Team |
|------|---------------|-----------------|
| **Platform Lead** | Overall direction, roadmap, major version releases | TBD |
| **Core Maintainers** | Code review, CI/CD, security, releases | TBD |
| **MCP Plugin Stewards** | Review and approve new MCP integrations | TBD |
| **Agent Curators** | Maintain default agents and prompt quality | TBD |
| **Documentation Stewards** | Keep internal docs up to date | TBD |

## Decision-Making Hierarchy

```
Feature Request / Bug Report
        │
        ▼
  Core Maintainers triage
        │
        ├─> P0 (critical): Immediate fix, no approval needed
        ├─> P1 (major): Requires Platform Lead approval
        ├─> P2 (minor): Requires one Core Maintainer approval
        └─> P3 (enhancement): Backlog, batch review weekly
```

## Feature Approval Process

1. **Proposal** — File a GitHub Issue with the `feature` template
2. **Design Review** — For changes affecting CLI API, agent behavior, or security
3. **Implementation** — PR with tests and documentation
4. **Code Review** — Two approvals required for core; one for plugins
5. **Staging** — Merged to `next` branch, deployed to internal staging
6. **Release** — After 48h staging validation, merged to `main`

## MCP Plugin Approval Process

1. **Submission** — PR adding the plugin to the registry
2. **Security Review** — Plugin runs as a subprocess; must not:
   - Access files outside its declared scope
   - Send data to unknown endpoints
   - Elevate permissions without user consent
3. **Integration Test** — Plugin must pass a standard test suite
4. **Documentation** — README with setup, usage, and example
5. **Approval** — MCP Plugin Steward signs off

## Security Policies

See [Security Policy](./security-policy.md) for details.

Key principles:
- **Least privilege** — Agents and plugins run with minimal permissions
- **User consent** — Destructive operations (write, edit, bash) require confirmation
- **Audit trail** — All tool calls are logged to session history
- **Secret redaction** — API keys and tokens are redacted from logs

## Release Procedures

See [Release Process](./release-process.md) for the full guide.

Summary:
- **Semantic versioning** (`major.minor.patch`)
- **Release cadence:** Minor releases every 2 weeks; patches as needed
- **Release notes** auto-generated from changelog
- **Breaking changes** require deprecation notice one minor version in advance

## Compliance & Standards

All contributions must adhere to:

1. MetaTeam Engineering Standards (internal wiki)
2. TypeScript strict mode
3. Existing code style and conventions
4. Test coverage requirements (see [Development Guidelines](./development-guidelines.md))
5. No hardcoded secrets or credentials
6. IP licensing boundaries (see [IP Governance](./ip-governance.md)) — enterprise
   code in `src/enterprise/` is proprietary and must not be distributed
   under the MIT license

## Escalation Path

| Issue | Contact |
|-------|---------|
| Security vulnerability | security@metateam.io (PGP encrypted) |
| Platform outage | #mtc-oncall (PagerDuty) |
| Feature request | GitHub Issues |
| General questions | #mtc-users (Slack) |
