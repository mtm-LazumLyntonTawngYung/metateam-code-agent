# Configuration Guide

How to configure **mtc** for your project.

---

## .mtc/ Directory

The `.mtc/` directory at your project root contains all project-level mtc
configuration:

```
.mtc/
├── mcp.json          # MCP server connections
├── agents/           # Custom agent definitions
├── rules/            # Project-specific rules
└── skills/           # Workspace-installed skills
```

Scaffold it with `mtc init`.

Two additional files live at the project root:

- `AGENTS.md` — agent guidelines appended to the active agent's system prompt
- `.mtcignore` — glob patterns ignored by `read_file` and `glob_files`

## Global Configuration (~/.config/mtc/)

Global settings live in `~/.config/mtc/`:

| Path | Purpose |
|------|---------|
| `config.json` | Central config (LLM providers, routing, theme, telemetry, license, installed skills) |
| `mcp.json` | Global MCP servers (fallback after project) |
| `agents/` | Global custom agents (merged with project agents) |
| `auth.json` | SSO tokens (Microsoft Entra ID) |
| `history.db` | SQLite database (sessions, messages, patches, telemetry) |
| `.mtcignore` | Global ignore patterns |

### config.json Schema

```jsonc
{
  "apiKey": "sk-...",                    // legacy single-provider key
  "endpoint": "https://api.deepseek.com/v1",
  "selectedModel": "deepseek-v4-flash",      // default model for the agent loop
  "agentId": "build",
  "installedSkills": ["tdd"],            // installed skill ids
  "telemetry": { "enabled": false, "deviceId": "..." },
  "llm": {
    "providers": [],
    "routing": {
      "simpleModel": "deepseek-v4-flash",
      "defaultModel": "deepseek-v4-flash",
      "reasoningModel": "claude-sonnet-4-20250514"
    }
  },
  "license": {},
  "themeId": "neon"
}
```

## MCP Servers (mcp.json)

MCP servers are loaded from the first matching source:

1. `.mtc/mcp.json` in the current directory
2. `~/.config/mtc/mcp.json` globally
3. OpenCode configs — `~/.config/opencode/opencode.json`,
   `~/.opencode/config.json`, or `.opencode.json` (disabled entries are skipped)

```json
{
  "mcpServers": {
    "my-plugin": {
      "command": "bun",
      "args": ["run", "path/to/server.ts"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

Servers are stdio-only subprocesses speaking JSON-RPC over stdin/stdout.
Manage them in the TUI with `/mcps`. Bundled bridges are in
`src/mcp-plugins/` (Figma, DevOps) — see [MCP Integrations](./mcp-integrations.md).

## Custom Agents

Create `.mtc/agents/<name>.md` (or `~/.config/mtc/agents/<name>.md`):

```markdown
---
name: My Agent
mode: subagent
permissions:
  read: allow
  bash: allow
  edit: deny
  execute: deny
---

You are a specialized agent. Describe the system prompt after the frontmatter.
```

Frontmatter fields:

| Field | Required | Values | Default |
|-------|----------|--------|---------|
| `name` | Yes | Any string | - |
| `mode` | No | `primary` \| `subagent` | `subagent` |
| `permissions.read` | No | `allow` \| `deny` | `allow` |
| `permissions.bash` | No | `allow` \| `deny` | `allow` |
| `permissions.edit` | No | `allow` \| `deny` | `allow` |
| `permissions.execute` | No | `allow` \| `deny` | `allow` |

The body text after the frontmatter becomes the agent's system prompt.

## Project Rules

Create `.mtc/rules/<name>.md` to append to the agent's system prompt:

```markdown
## Project Rules
- All new functions must have JSDoc
- Use const over let
- Keep files under 400 lines
```

Rules are loaded from every file in `.mtc/rules/` (or a single `.mtc/rules`
file) plus `AGENTS.md` at the project root.

## LLM Providers

Provider keys are stored in `~/.config/mtc/config.json` — **not** in
environment variables. Configure them with the CLI:

```bash
# Show current providers and routing
mtc llm status

# Add a provider (deepseek | openai | anthropic | openrouter)
mtc llm set-provider --id deepseek --key sk-...

# Set routing models (simple / default / reasoning)
mtc llm set-routing --simple deepseek-v4-flash --default deepseek-v4-flash --reasoning claude-sonnet-4-20250514

# List all known models
mtc llm models
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MTC_AZURE_CLIENT_ID` | Azure AD application ID for device-code SSO |
| `MTC_AZURE_TENANT_ID` | Azure AD tenant ID for device-code SSO |
| `MTC_AZURE_CLIENT_SECRET` | Azure client secret (optional) |
| `MTC_GITHUB_TOKEN` / `GITHUB_TOKEN` | GitHub token for the daemon (autofix) |
| `MTC_GITLAB_TOKEN` / `GITLAB_TOKEN` | GitLab token for the daemon |
| `MTC_WEBHOOK_SECRET` | Daemon webhook HMAC-SHA256 verification secret |
| `MTC_SLACK_WEBHOOK` | Slack incoming webhook for daemon notifications |
| `MTC_TEAMS_WEBHOOK` | Microsoft Teams webhook for daemon notifications |
| `MTC_LICENSE_SECRET` | HMAC secret for enterprise license signing/verification |
| `MTC_WS_TOKEN` | Auth token for `mtc serve` (WebSocket) |
| `FIGMA_TOKEN` / `FIGMA_ACCESS_TOKEN` | Figma API token (Figma bridge) |
| `DATADOG_API_KEY` / `DATADOG_APP_KEY` | Datadog credentials (DevOps bridge) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS credentials for CloudWatch (DevOps bridge) |
| `EDITOR` | Default editor opened by `/editor` (fallback `code`) |

Daemon-related variables can also be passed as CLI flags — see
[Daemon & Autonomous Mode](./daemon.md).
