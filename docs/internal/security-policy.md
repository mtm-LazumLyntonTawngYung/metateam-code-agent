# Security Policy

Security guidelines and vulnerability reporting for the **mtc** platform.

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest minor release | Yes |
| Previous minor release | Security patches only |
| Older releases | No |

## Reporting a Vulnerability

**Do not file a public issue for security vulnerabilities.**

Contact the security team directly:

- **Email:** security@metateam.io
- **PGP Key:** Available on the MetaTeam security wiki
- **Expected response time:** 24 hours

Include:

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Any proposed fix (optional)

After reporting, you'll receive:

1. Acknowledgment within 24h
2. Status updates every 72h
3. Disclosure timeline and CVE assignment (if applicable)

## Security Principles

### Least Privilege

Agents and MCP plugins run with minimal required permissions:

- **Plan agent:** Read-only (files, glob, execute; no edit or bash)
- **Build agent:** Full access, but destructive operations require user confirmation
- **MCP plugins:** Sandboxed subprocesses with no default filesystem access
- **Custom agents:** Explicitly declared permissions in agent definition

### User Consent

All destructive operations must be confirmed:

| Operation | Consent Required |
|-----------|-----------------|
| `/read` | No |
| `/glob` | No |
| `/write` | Yes |
| `/edit` | Yes |
| `/bash` | Yes (configurable) |
| `/call` | Depends on tool |

### Secret Redaction

API keys, tokens, and credentials are automatically redacted from:

- Session history
- Log output
- Telemetry data
- Agent context

Redaction patterns are defined in `src/secrets/`.

### Audit Trail

Every session records:

- All tool calls with timestamps
- Files read, written, and edited
- Bash commands executed
- Agent switches
- Token usage

History is stored locally in SQLite at `~/.config/mtc/history.db`.

## Access Control

### Repository Access

| Role | Access |
|------|--------|
| Platform Lead | Admin |
| Core Maintainer | Write |
| Contributor | Read + Fork |
| External | Read (public docs only) |

### MCP Plugin Security Review

All MCP plugins must pass security review before approval:

1. **Static analysis** — No obfuscated code, no eval, no dynamic imports
2. **Network scan** — No unexpected outbound connections
3. **File access scan** — Declares all filesystem access
4. **Dependency audit** — No known vulnerable dependencies
5. **Runtime sandbox** — Confirms subprocess isolation

## Incident Response

1. **Detect** — Automated scanning, user reports
2. **Triage** — Severity assessment (P0-P3)
3. **Contain** — Revoke access, disable feature, rollback
4. **Fix** — Patch, test, release
5. **Disclose** — Internal announcement, CVE if required
6. **Post-mortem** — Root cause analysis, prevent recurrence
