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
- **Local LLM Support** — Run local models via llama.cpp (`llama-server`) for offline/private use.
- **Agent-driven Eval & Benchmarking** — Run the real agent loop against sandboxed tasks with `mtc eval run` and benchmark all tasks with `mtc eval bench`.
- **Webhook Security Gateway** — Constant-time signature validation for GitHub webhooks and token validation for GitLab; unauthenticated requests return 401.
- **Autonomous Daemon** — Headless webhook daemon that labels issues and opens draft PRs with fixes (GitHub only; GitLab webhooks are acknowledged but rejected).
- **Enterprise Edition** — Tiered licensing, audit logs, org management, and a web control-plane dashboard with real-time updates, analytics, and export capabilities.

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

# Run agent-driven eval against a sandboxed task
mtc eval run <task> --model <id>

# Benchmark all eval tasks
mtc eval bench
```

The CLI binary is `mtc`.

## Key Bindings

| Key | Action |
|-----|--------|
| `Tab` | Open agent selector |
| `Ctrl+P` / `/` | Open command palette |
| `Esc` | Close overlay / go back to home |
| `↑` / `↓` | Navigate command history / partial history search |
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

### Local LLMs (llama.cpp)

You can run local models using [llama.cpp](https://github.com/ggerganov/llama.cpp):

```bash
# Start llama-server on port 8080
llama-server -hf Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M --port 8080

# Configure metateam to use it
mtc llm set-provider -i llamacpp -k dummy -u http://localhost:8080/v1 -m qwen2.5-7b-instruct
mtc llm set-routing --default qwen2.5-7b-instruct
```

**Note:** Models with <7B parameters may not reliably support tool calling. For full agent functionality (file editing, bash execution), use models with 7B+ parameters.

### MCP Servers

MCP servers are loaded from:
1. `.mtc/mcp.json` in the current working directory
2. `~/.config/mtc/mcp.json` globally
3. OpenCode configuration files (`~/.config/opencode/opencode.json`, `~/.opencode/config.json`, `.opencode.json`)

### Custom Agents

Custom agents can be defined in `.mtc/agents/*.md` or `~/.config/mtc/agents/*.md`. Each agent has a system prompt and permissions (`read`, `bash`, `edit`, `execute`). New custom agents default to `read: allow`, `edit/bash/execute: deny`. Frontmatter `permissions` are honored explicitly (`allow`/`deny`).

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

## Security

- **Webhook validation** — GitHub signatures are verified with `crypto.timingSafeEqual` (constant-time comparison); GitLab tokens are validated similarly. Unauthenticated webhook requests return 401.
- **Clone URL validation** — Strict regex validation on repository clone URLs.
- **Path traversal prevention** — Resolved-path containment checks for LLM-written files in the autofix pipeline.
- **License verification** — HMAC-SHA256 license key verification with fail-closed behavior when `MTC_LICENSE_SECRET` is not set.
- **Auth token storage** — SSO tokens written with 0600 file permissions.
- **Cross-platform hardening** — CRLF normalization in file reads and MCP plugins; OS temp paths for daemon; `join()`-based path handling.

## Documentation

- **[Internal Documentation Portal](docs/internal/README.md)** — Onboarding, governance, architecture, workflows
- **[Internal Playbook](docs/playbook.md)** — Prompt engineering, agent usage, troubleshooting
- **[Migration Guide](docs/migration-guide.md)** — License format, SSO, agent permissions, and telemetry changes
- **[Hackathon Guide](docs/hackathon.md)** — Building subagents and MCP plugins
