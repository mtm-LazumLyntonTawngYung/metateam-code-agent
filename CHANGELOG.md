# Changelog

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
