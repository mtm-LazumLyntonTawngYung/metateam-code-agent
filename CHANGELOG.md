# Changelog

## [Unreleased]

### Added
- **Webhook security gateway** — constant-time GitHub signature and GitLab token validation (`crypto.timingSafeEqual`); unauthenticated webhook requests now return 401
- **Clone URL and path traversal validation** — strict regex on repository clone URLs and resolved-path containment checks for LLM-written files in the autofix pipeline
- **SSO public-client device flow** — `MTC_AZURE_CLIENT_SECRET` is now optional; auth tokens written with 0600 permissions; exact `@metateammyanmar.com` domain check
- **Single version source** — `src/version.ts` now the sole source of truth (updater, CLI, header, sidebar); `checkForUpdates` compares semver numerically
- **Cross-platform hardening** — CRLF normalization in `read_file` and MCP plugins; daemon temp dir uses OS temp path; `join()`-based path handling in the autofix pipeline; CI tests on Linux, macOS, and Windows
- **Structured JSON logging** — daemon logs JSON lines with levels, job IDs, and secret redaction; `GET /health` liveness endpoint
- **Opt-in telemetry** — disabled by default with full privacy disclosure on `mtc analytics enable`; see `docs/internal/privacy-policy.md`
- **Property tests** — Property 9 (cross-platform paths) and Property 12 (build/version determinism)
- **Migration guide** — `docs/migration-guide.md` for license format, SSO, agent permission, and telemetry changes

### Changed
- **GitLab daemon (BREAKING behavior)** — GitLab webhook events are now explicitly rejected with a logged warning instead of silently no-oping; only GitHub repositories can be autofixed
- **Telemetry default (BREAKING)** — usage analytics are now off unless explicitly enabled
- **License system redesign (BREAKING)** — license keys now use canonical `MTC-<tier>-<base64url(payload)>-<hmac>` format with HMAC verification, expiry enforced at read time, and fail-closed behavior when `MTC_LICENSE_SECRET` is not set. Existing keys must be regenerated.
- **Custom agent defaults (BREAKING)** — new custom agents default to `read: allow`, `edit/bash/execute: deny`; frontmatter `permissions` are now honored explicitly (`allow`/`deny`). The `mtc init` template already matched.
- **Sidebar cleanup** — removed always-stubbed `costSpent` and LSP status rows from the sidebar
- **Daemon config fix** — env-var warning now prints the correct variable name (hyphens converted to underscores)
- **Documentation sync** — updated all docs to match the current implementation:
  - `README.md`: corrected key bindings; added LLM provider config, MCP load order, and skills
  - `docs/internal/commands.md`: full CLI command inventory (`eval`, `llm`, `analytics`, `daemon`, `enterprise`, `auth`), accurate slash commands, key bindings, and agent permission matrix
  - `docs/internal/configuration.md`: real environment variables, global config schema, custom-agent frontmatter
  - `docs/internal/daemon.md`: environment variables, webhook limits, GitHub-only autofix caveat
  - `docs/internal/onboarding.md`, `faq.md`, `troubleshooting.md`, `security-policy.md`: corrected LLM setup, config paths, and removed nonexistent options
  - `docs/internal/architecture.md` and `development-guidelines.md`: module structure matching `src/`
  - `docs/internal/repository-management.md`: actual CI/CD workflows and branch strategy
  - `docs/playbook.md`, `ai-workflows.md`, `multi-department-workflows.md`: corrected Plan/Build/subagent invocation (subagents run `/read`, `/glob`, `/call` only)
  - `docs/hackathon.md`: fixed broken plugin-registry link
  - `.env.example`: documented all supported environment variables

## [0.5.0] - 2026-07-29

### Added
- **Enterprise license system** — key generation, activation/deactivation, tier gating (community/enterprise/enterprise-plus)
- **Enterprise audit logging** — immutable event log with actor/action/resource, queryable via CLI and API
- **Organization management** — multi-tenant orgs with RBAC, settings, seat tracking
- **Feature flag system** — `hasFeature()` and `gateEnterprise()` for tier-based feature gating
- **Web dashboard** — self-hosted admin control plane with overview, license, audit, analytics, orgs, and connections views
- **Enterprise CLI commands** — `mtc enterprise status`, `activate`, `deactivate`, `generate`, `dashboard`, `audit`, `org`
- **Commercialization documentation** — tier comparison, deployment options, SOC2 compliance overview

## [0.4.0] - 2026-07-29

### Added
- **QA Tester agent** — generates Cypress/Playwright E2E suites from user stories
- **Figma MCP Bridge** — converts Figma components to React/Tailwind code via Figma API
- **DevOps Engineer agent** — infrastructure log analysis, K8s/Terraform diagnostics
- **DevOps MCP Bridge** — Datadog log/metric queries, CloudWatch Insights, K8s manifest analyzer, Terraform plan analyzer, log diagnosis engine
- **Product Manager agent** — user stories, sprint plans, release notes, PRD outlines
- **Multi-department workflows documentation** — setup guides for QA, Design, DevOps, PM

## [0.3.0] - 2026-07-29

### Added
- **Daemon mode** (`mtc daemon`) — headless background worker with webhook listener
- **Webhook server** — receives GitHub/GitLab webhooks with HMAC-SHA256 verification
- **Autonomous bug fixing pipeline** — clones repo, analyzes issues via LLM, writes fixes, runs tests, opens Draft PRs
- **GitHub API client** — full REST + GraphQL support for repos, issues, branches, blobs, trees, commits, and PRs
- **GitLab API client** — issue notes, branches, merge requests, project management
- **Slack notifications** — rich message attachments with status, repo, issue, and PR links
- **Teams notifications** — Adaptive Cards with facts and action buttons
- **Pipeline job tracking** — concurrent job management, status lifecycle, error handling
- **Autofix retry logic** — one retry attempt if tests fail after initial fix
- **Daemon configuration** — `.mtc/daemon.json` config template, CLI options for all settings

## [0.2.0] - 2026-07-29

### Added
- Internal documentation portal with 15+ guides
- Developer onboarding guide with setup checklist
- Platform governance model with ownership and approval processes
- Security policy with vulnerability reporting and incident response
- Contribution guidelines and PR templates
- Release process with versioning and changelog standards
- Architecture overview with module structure and data flow
- Command reference and configuration guide
- AI workflow patterns (Plan/Build/Verify)
- MCP integration guide for plugin developers
- Troubleshooting guide and internal FAQ
- Training workshop agenda and knowledge-sharing materials
- GitHub issue templates (bug, feature, plugin proposal)
- Repository management guide with RBAC and CI/CD

## [0.1.0] - 2026-07-29

### Added
- Initial release of MTC Code Agent
- Terminal UI with Ink/React
- File tools: read, write, edit, glob
- Bash execution with permission system
- Eval runner for test-driven development
- Session management with SQLite history
- Token counting and context rotation
- MCP server integration
- Secret redaction system
- Custom agent definitions
- Project rules engine (.mtc/rules)
- Telemetry and analytics dashboard
- WebSocket server mode (mtc serve)
- VS Code extension (vscode-mtc)
- Project scaffolding (mtc init)
- Automated PR reviews (mtc review)
- GitHub Actions CI/CD integration
- Install script with platform detection
