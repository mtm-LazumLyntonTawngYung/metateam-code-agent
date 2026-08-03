# metateam-code-agent

AI-powered, terminal-first coding assistant tailored for MetaTeam engineers to accelerate development, refactoring, and code reviews.

## Features

- **Terminal-native UI** — Built with Ink (React for CLIs), providing a responsive and interactive experience directly in your terminal.
- **Multiple Agents** — Switch between built-in and custom agents, each with configurable system prompts and tool permissions.
- **MCP Integration** — Connect to external tools and services via the Model Context Protocol (MCP).
- **Smart Tool Permissions** — Granular control over which tools each agent can use, with user-facing permission prompts for sensitive operations.
- **Session Management** — Persistent conversation history, token tracking, and automatic session summaries.
- **Code Editing Tools** — Read, write, edit, and search files; run bash commands; all tracked and permissioned.
- **Multi-LLM Routing** — Configure DeepSeek, OpenAI, Anthropic, or OpenRouter providers with automatic task classification and fallback.
- **Autonomous Daemon** — Headless webhook daemon that labels issues and opens draft PRs with fixes (GitHub only; GitLab webhooks are acknowledged but rejected).
- **Enterprise Edition** — Tiered licensing, audit logs, org management, and a web control-plane dashboard.

## Installation

```bash
bun install
```

## Usage

```bash
# Development
bun run dev

# Build binary
bun run build

# Type check
bun run typecheck
```

The CLI binary is `mtc`.

## Key Bindings

| Key | Action |
|-----|--------|
| `Tab` | Open agent selector |
| `Ctrl+P` / `/` | Open command palette |
| `Esc` | Close overlay / go back to home |
| `↑` / `↓` | Scroll log or navigate lists |
| `PageUp` / `PageDown` | Scroll by one viewport |
| `Home` / `End` | Jump to top / bottom |
| `Enter` | Submit input |
| `d` | Delete highlighted session (Sessions view) |
| `Space` | Toggle MCP server (MCP view) |
| `y` / `n` / `a` | Accept / reject / always-allow permission |

## Configuration

### LLM Providers

LLM provider keys and routing are managed through the CLI (stored in `~/.config/mtc/config.json`), not environment variables:

```bash
mtc llm status
mtc llm set-provider --id deepseek --key sk-...
mtc llm set-routing --simple deepseek-chat --default deepseek-chat --reasoning claude-sonnet-4-20250514
```

### MCP Servers

MCP servers are loaded from:
1. `.mtc/mcp.json` in the current working directory
2. `~/.config/mtc/mcp.json` globally
3. OpenCode configuration files (`~/.config/opencode/opencode.json`, `~/.opencode/config.json`, `.opencode.json`)

### Custom Agents

Custom agents can be defined in `.mtc/agents/*.md` or `~/.config/mtc/agents/*.md`. Each agent has a system prompt, permissions (`read`, `bash`, `edit`, `execute`), and can operate as a primary or subagent.

### Rules

Project-specific rules in `.mtc/rules/` (and `AGENTS.md` at the project root) are loaded and appended to the active agent's system prompt.

### Skills

Skills can be installed from the built-in catalog or from `.mtc/skills/<id>/SKILL.md` (workspace) and `~/.mtc/skills/<id>/SKILL.md` (global). Open them with `/skills`.

### Enterprise Licenses

Enterprise features (SSO, org management, audit logs, dashboard) are enabled with a
license key activated via `mtc enterprise activate <key>`.

- Keys use the canonical format `MTC-<tier>-<base64url(payload)>-<hmac>` and are
  verified with HMAC-SHA256 against a secret.
- **A `MTC_LICENSE_SECRET` env var is required** to generate *and* activate keys.
  Keys generated without the secret cannot be verified and will be rejected on
  activation. Set it in your environment before running `mtc enterprise generate-key`.

### SSO (Microsoft Entra ID)

SSO uses the public-client device-code flow. A client secret is **optional** for
interactive logins — only the client ID and tenant ID are required. If a
`MTC_AZURE_CLIENT_SECRET` is present it is used, otherwise the public-client flow
is used. Auth tokens are stored with 0600 file permissions.

### Telemetry

Usage analytics are **opt-in** and disabled by default. Enable them with
`mtc analytics enable` (a full privacy disclosure is printed), disable anytime
with `mtc analytics disable`. Data is stored locally and never includes file
contents, prompts, or responses. See [docs/internal/privacy-policy.md](docs/internal/privacy-policy.md).

## Documentation

- **[Internal Documentation Portal](docs/internal/README.md)** — Onboarding, governance, architecture, workflows
- **[Internal Playbook](docs/playbook.md)** — Prompt engineering, agent usage, troubleshooting
- **[Hackathon Guide](docs/hackathon.md)** — Building subagents and MCP plugins

## Development

This project uses:
- [Bun](https://bun.sh) as the runtime
- [Ink](https://github.com/vadimdemedes/ink) for the TUI
- [TypeScript](https://www.typescriptlang.org/) for type safety

### Eval & Benchmarking

The eval suite in `tests/evals/` runs the agent against real coding tasks
(sandboxed) and checks the result with an assertion script:

```bash
# List available tasks
mtc eval list

# Run one task with the agent (requires a configured LLM provider)
mtc eval run add-unit-tests --model deepseek-chat

# Benchmark all tasks and print a pass/fail score table
mtc eval bench

# Replay a scripted solution against the task tools (no LLM)
mtc eval run add-unit-tests --solution tests/evals/add-unit-tests/solution.mtc
```

Requires an LLM provider key configured via `mtc llm set-provider`. The
benchmark output (`Score: N/M passed`) is what you'd use to compare model
and prompt changes against OpenCode/Kilo on the same tasks.

## License

Dual-licensed:

- **MIT** — all code except `src/enterprise/`. See [LICENSE](LICENSE).
- **Proprietary (Enterprise Edition)** — `src/enterprise/` is commercial
  and requires a license key. See [LICENSE.ENTERPRISE](LICENSE.ENTERPRISE).
