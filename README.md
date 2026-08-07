# MetaTeam Code Agent

A production-grade, terminal-first AI coding assistant built for MetaTeam engineers to accelerate development, refactoring, and code reviews. Run as an interactive TUI, headless daemon, or VS Code extension.

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              metateam-code-agent             │
                    └─────────────────────────────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
         cli/                    tui/ (Ink)                 server/
     (Commander.js)           (React for CLIs)         (WebSocket, editor)
            │                         │                         │
            ▼                         ▼                         ▼
      ┌──────────┐           ┌──────────────┐          ┌──────────────┐
      │ Commands │           │    Agent     │          │   VS Code    │
      │ eval,    │           │   Loop +     │          │  Extension   │
      │ daemon,  │           │  Permissions │          │  (WebSocket) │
      │ serve,   │           └──────┬───────┘          └──────────────┘
      │ llm, ... │                  │
      └────┬─────┘           ┌──────┼──────────┐
           │                 │      │          │
           ▼                 ▼      ▼          ▼
      ┌─────────┐      ┌─────────┐  ┌──────────┐  ┌──────────┐
      │  LLM    │      │  Tools  │  │  MCP     │  │ Session  │
      │ Router  │      │ Registry│  │ Client   │  │ Store    │
      │+Fallback│      │+Plugins │  │          │  │+Patches  │
      └─────────┘      └────┬────┘  └────┬─────┘  └──────────┘
                             │            │
                    ┌────────┴────────┐   │
                    │   Providers     │   │
                    │ DeepSeek/OpenAI │   │
                    │ Anthropic/      │   │
                    │ OpenRouter/     │   │
                    │ llama.cpp       │   │
                    └─────────────────┘   │
                                         │
                    ┌────────────────────┘
                    │
              ┌─────┴──────┐
              │   Daemon   │
              │ (Webhook + │
              │  Autofix)  │
              └────────────┘
```

**Core Pipeline:** Start → agent selection → tool execution with permission checks → streaming LLM response → session persistence → optional headless daemon (webhooks → clone → fix → PR) or enterprise dashboard analytics.

## Features

| Feature                     | Description                                                              |
|-----------------------------|--------------------------------------------------------------------------|
| Terminal-native UI          | Built with Ink (React for CLIs), responsive and interactive             |
| Multiple Agents             | Built-in and custom agents with configurable prompts and permissions     |
| MCP Integration             | Connect external tools via Model Context Protocol                       |
| Smart Tool Permissions      | Granular read/bash/edit/execute controls per agent                       |
| Session Management          | Persistent history, file patches, token tracking, auto-summaries        |
| Code Editing Tools          | Read, write, edit, search files; run bash; glob; grep; apply patches    |
| Multi-LLM Routing           | DeepSeek, OpenAI, Anthropic, OpenRouter with task classification        |
| Local LLM Support           | Run local models via llama.cpp for offline/private use                  |
| Eval & Benchmarking         | Agent-driven sandboxed task evaluation (`mtc eval run`)                 |
| Webhook Security Gateway    | Constant-time signature validation for GitHub/GitLab webhooks           |
| Autonomous Daemon           | Headless autofix pipeline: clone → analyze → fix → test → push → PR     |
| Enterprise Edition          | Tiered licensing, SSO, RBAC, audit logs, org management, web dashboard  |
| VS Code Extension           | WebSocket-based editor integration with sidebar and status bar          |
| Collaboration               | Shared sessions with real-time multi-user support and offline sync      |

## Tech Stack

| Layer           | Technology                                                      |
|-----------------|-----------------------------------------------------------------|
| Runtime         | Bun 1.2+                                                        |
| Language        | TypeScript 7 (strict, ESNext, React JSX)                        |
| TUI             | Ink 7 + React 19 + @inkjs/ui                                   |
| CLI             | Commander.js 15                                                 |
| LLM             | OpenAI-compatible, DeepSeek, Anthropic, OpenRouter, llama.cpp  |
| Validation      | Zod 3                                                           |
| State           | SQLite (shared sessions)                                        |
| Editor          | VS Code extension (WebSocket client)                            |
| CI/CD           | GitHub Actions (test matrix, releases, PR review)               |

## Prerequisites

- Bun v1.2+ (https://bun.sh)
- Git
- Node.js 18+ (for VS Code extension)

## Setup

### 1. From npm

```bash
npm install -g @metateam/cli
mtc --version
```

### 2. Quick Install (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/mtm-LazumLyntonTawngYung/metateam-code-agent/develop/install.sh | bash
```

Installs the latest pre-built binary to `/usr/local/bin`. Override the install directory:

```bash
MTC_INSTALL_DIR=~/.local/bin curl -fsSL ... | bash
```

### 3. Build from Source

```bash
git clone git@github.com:mtm-LazumLyntonTawngYung/metateam-code-agent.git
cd metateam-code-agent
bun install
bun run build
```

Add the binary to your `PATH`:

```powershell
# Windows (PowerShell, current session)
$env:PATH += ";D:\path\to\metateam-code-agent\bin"

# Windows (permanent, user-level)
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";D:\path\to\metateam-code-agent\bin", "User")
```

```bash
# macOS / Linux
export PATH="$PATH:/path/to/metateam-code-agent/bin"
# Or move it somewhere already on PATH
sudo cp bin/mtc /usr/local/bin/
```

### 4. Docker

```bash
docker build -t mtc .
docker run -it mtc
```

## Configuration

### LLM Providers

LLM provider keys and routing are managed through the CLI (stored in `~/.config/mtc/config.json`), not environment variables:

```bash
mtc llm status
mtc llm set-provider --id deepseek --key sk-...
mtc llm set-routing --simple deepseek-chat --default deepseek-chat --reasoning claude-sonnet-4-20250514
```

### Local LLMs (llama.cpp)

Run local models using [llama.cpp](https://github.com/ggerganov/llama.cpp):

```bash
# Start llama-server on port 8080
llama-server -hf Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M --port 8080

# Configure metateam to use it
mtc llm set-provider -i llamacpp -k dummy -u http://localhost:8080/v1 -m qwen2.5-7b-instruct
mtc llm set-routing --default qwen2.5-7b-instruct
```

**Note:** Models with <7B parameters may not reliably support tool calling. For full agent functionality, use models with 7B+ parameters.

### MCP Servers

MCP servers are loaded from:
1. `.mtc/mcp.json` in the current working directory
2. `~/.config/mtc/mcp.json` globally
3. OpenCode configuration files (`~/.config/opencode/opencode.json`, `~/.opencode/config.json`, `.opencode.json`)

### Custom Agents

Custom agents can be defined in `.mtc/agents/*.md` or `~/.config/mtc/agents/*.md`. Each agent has a system prompt and permissions (`read`, `bash`, `edit`, `execute`). New custom agents default to `read: allow`, `edit/bash/execute: deny`.

### Rules

Project-specific rules in `.mtc/rules/` (and `AGENTS.md` at the project root) are loaded and appended to the active agent's system prompt.

### Skills

Skills can be installed from the built-in catalog or from `.mtc/skills/<id>/SKILL.md` (workspace) and `~/.mtc/skills/<id>/SKILL.md` (global). Open them with `/skills` in the TUI.

### Enterprise Licenses

Enterprise features (SSO, org management, audit logs, dashboard) are enabled with a license key activated via `mtc enterprise activate <key>`.

- Keys use the canonical format `MTC-<tier>-<base64url(payload)>-<hmac>` and are verified with HMAC-SHA256 against a secret.
- **A `MTC_LICENSE_SECRET` env var is required** to generate and activate keys. Keys generated without the secret cannot be verified and will be rejected on activation.

### SSO (Microsoft Entra ID)

SSO uses the public-client device-code flow. A client secret is **optional** for interactive logins — only the client ID and tenant ID are required. Auth tokens are stored with 0600 file permissions.

### Telemetry

Usage analytics are **opt-in** and disabled by default. Enable them with `mtc analytics enable` (a full privacy disclosure is printed), disable anytime with `mtc analytics disable`. Data is stored locally and never includes file contents, prompts, or responses.

## Environment Variables

| Variable                  | Description                                          |
|---------------------------|------------------------------------------------------|
| `MTC_AZURE_CLIENT_ID`     | Microsoft Entra ID client ID for SSO                 |
| `MTC_AZURE_TENANT_ID`     | Microsoft Entra ID tenant ID for SSO                 |
| `MTC_AZURE_CLIENT_SECRET` | Optional client secret for SSO                       |
| `MTC_GITHUB_TOKEN`        | GitHub token for daemon webhook operations           |
| `MTC_GITLAB_TOKEN`        | GitLab token for daemon webhook operations           |
| `MTC_WEBHOOK_SECRET`      | GitHub webhook HMAC secret                           |
| `MTC_SLACK_WEBHOOK`       | Slack notification webhook URL                       |
| `MTC_TEAMS_WEBHOOK`       | Teams notification webhook URL                       |
| `MTC_WS_TOKEN`            | WebSocket server auth token (`mtc serve`)            |
| `MTC_LICENSE_SECRET`      | Enterprise license signing secret                    |
| `FIGMA_TOKEN`             | Figma MCP bridge API token                           |
| `DATADOG_API_KEY`         | Datadog MCP bridge API key                           |
| `DATADOG_APP_KEY`         | Datadog MCP bridge app key                           |
| `AWS_ACCESS_KEY_ID`       | AWS MCP bridge access key                            |
| `AWS_SECRET_ACCESS_KEY`   | AWS MCP bridge secret key                            |

## Command Reference

### Core

| Command                    | Description                                          |
|----------------------------|------------------------------------------------------|
| `mtc`                      | Start the interactive TUI                            |
| `bun run dev`              | Start from source without building                   |
| `bun run build`            | Build standalone binary                              |
| `bun run typecheck`        | Type-check the project                               |
| `bun test`                 | Run unit tests                                       |

### Evaluation

| Command                              | Description                                      |
|--------------------------------------|--------------------------------------------------|
| `mtc eval list`                      | List available eval tasks                        |
| `mtc eval run <task> --model <id>`   | Run agent against a sandboxed task               |
| `mtc eval run <task> --solution <path>` | Run with a reference solution                |
| `mtc eval bench`                     | Benchmark all eval tasks                         |

### Server & Daemon

| Command                                            | Description                                      |
|----------------------------------------------------|--------------------------------------------------|
| `mtc serve [-p 8080] [-H 127.0.0.1] [-t ws-token]` | Start WebSocket server for editor integration    |
| `mtc daemon [-p 8080] [-H 0.0.0.0] [-s secret] ...` | Start headless webhook daemon                 |

### Enterprise

| Command                                        | Description                                      |
|------------------------------------------------|--------------------------------------------------|
| `mtc enterprise status`                        | Check license status                             |
| `mtc enterprise activate <key>`                | Activate an enterprise license                   |
| `mtc enterprise deactivate`                    | Deactivate current license                       |
| `mtc enterprise dashboard [-p 3000]`           | Start web control-plane dashboard                |
| `mtc enterprise audit [-l 20] [-a actor]`      | View audit logs                                  |
| `mtc enterprise org list`                      | List organizations                               |
| `mtc enterprise org create <name> <slug>`      | Create an organization                           |

### Other

| Command                              | Description                                      |
|--------------------------------------|--------------------------------------------------|
| `mtc llm status`                     | Show current LLM provider and model              |
| `mtc llm set-provider ...`           | Configure an LLM provider                        |
| `mtc llm set-routing ...`            | Configure model routing                          |
| `mtc llm models`                     | List available models                            |
| `mtc session list [-n 20]`           | List recent sessions                             |
| `mtc session patches <id> [file]`    | Show file patches for a session                  |
| `mtc session revert <id> <file>`     | Revert a file to a previous version             |
| `mtc plugin list`                    | List loaded plugins                              |
| `mtc plugin reload`                  | Reload plugins                                   |
| `mtc init [dir]`                     | Initialize a new project with `.mtc/` and rules  |
| `mtc review [-d dir] [--files ...]`  | Run static code review                           |
| `mtc analytics enable|disable|status` | Manage usage telemetry                           |
| `mtc auth logout`                    | Clear stored auth tokens                         |
| `mtc debug info`                     | Show debug information                           |

## Usage

1. Run `mtc` to start the interactive TUI.
2. Use `Tab` to switch agents, `Ctrl+P` or `/` for commands.
3. Type questions or requests — the agent uses file, bash, websearch, and other tools.
4. Review file patches in the diff view, accept or revert changes.
5. For headless CI/CD, run `mtc daemon` to listen for GitHub webhooks and auto-open fix PRs.
6. For editor integration, run `mtc serve` and connect from the VS Code extension.

To enable re-ranking or local models, configure via the TUI settings or `mtc llm set-provider`.

## Key Bindings

| Key                  | Action                                        |
|----------------------|-----------------------------------------------|
| `Tab`                | Open agent selector                           |
| `Ctrl+P` / `/`       | Open command palette                          |
| `Esc`                | Close overlay / go back to home               |
| `↑` / `↓`            | Navigate command history / partial search     |
| `PageUp` / `PageDown`| Scroll by one viewport                        |
| `Home` / `End`       | Jump to top / bottom                          |
| `Enter`              | Submit input                                  |
| `d`                  | Delete highlighted session (Sessions view)     |
| `Space`              | Toggle MCP server (MCP view)                  |
| `y` / `n` / `a`      | Accept / reject / always-allow permission     |

## Security

- **Webhook validation** — GitHub signatures verified with `crypto.timingSafeEqual` (constant-time); GitLab tokens validated similarly. Unauthenticated requests return 401.
- **Clone URL validation** — Strict regex validation on repository clone URLs.
- **Path traversal prevention** — Resolved-path containment checks for LLM-written files in the autofix pipeline.
- **License verification** — HMAC-SHA256 license key verification with fail-closed behavior when `MTC_LICENSE_SECRET` is not set.
- **Auth token storage** — SSO tokens written with 0600 file permissions.
- **Cross-platform hardening** — CRLF normalization in file reads and MCP plugins; OS temp paths for daemon; `join()`-based path handling.
- **Secret redaction** — Sensitive values redacted in daemon logs and review output.

## Documentation

- **[Internal Documentation Portal](docs/internal/README.md)** — Onboarding, governance, architecture, workflows
- **[Internal Playbook](docs/playbook.md)** — Prompt engineering, agent usage, troubleshooting
- **[Migration Guide](docs/migration-guide.md)** — License format, SSO, agent permissions, and telemetry changes
- **[Hackathon Guide](docs/hackathon.md)** — Building subagents and MCP plugins

## Project Structure

```
├── bin/
│   └── mtc.js                  # Node shim that spawns Bun to run src/cli.tsx
├── src/
│   ├── agents/                 # Agent system (builtin, custom, subagents, rules)
│   ├── auth/                   # Microsoft Entra ID SSO
│   ├── config/                 # Global + project config loading/saving
│   ├── daemon/                 # Webhook daemon (GitHub/GitLab, autofix pipeline)
│   ├── enterprise/             # Proprietary enterprise features (RBAC, license, dashboard)
│   ├── eval/                   # Agent-driven evaluation & benchmarking
│   ├── init/                   # Project initialization (AGENTS.md, .mtc/, rules)
│   ├── llm/                    # LLM providers, routing, fallback
│   ├── mcp/                    # Model Context Protocol client/server integration
│   ├── plugins/                # Plugin loader, hooks, tool registration
│   ├── review/                 # Static review (secrets, debug artifacts, standards)
│   ├── secrets/                # Secret redaction & patterns
│   ├── server/                 # Headless WebSocket server for editor integration
│   ├── session/                # Conversation history, patches, tokens, summaries
│   ├── shared-sessions/        # Collaborative/shared session engine
│   ├── skills/                 # Skill catalog, registry, built-in skills
│   ├── telemetry/              # Opt-in usage analytics
│   ├── tools/                  # Built-in tools (file, bash, git, websearch, etc.)
│   ├── ui/                     # Ink (React for CLIs) TUI components
│   └── utils/                  # Logger, updater, security helpers
├── tests/
│   └── unit/                   # Unit tests
├── vscode-mtc/                 # VS Code extension
│   ├── src/
│   │   ├── extension.ts
│   │   ├── webSocketClient.ts
│   │   └── sidebarProvider.ts
│   └── package.json
├── examples/
│   └── plugins/
│       └── hello.ts            # Example MTC plugin
├── .mtc/                       # Project-local MTC configuration
│   ├── agents/                 # Custom agent markdown definitions
│   ├── daemon.json             # Daemon runtime config
│   └── mcp.json                # MCP server registry
├── package.json                # @metateam/cli v3.0.1
├── tsconfig.json               # TypeScript 7 strict config
├── .env.example                 # Environment variable template
└── CHANGELOG.md                 # Release history
```

## License

- **Community Edition:** MIT License
- **Enterprise Edition:** Proprietary license (see `LICENSE.ENTERPRISE`)

Enterprise features require a valid license key activated via `mtc enterprise activate <key>`.
