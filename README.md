# metateam-code-agent

AI-powered, terminal-first coding assistant tailored for MetaTeam engineers
to accelerate development, refactoring, and code reviews.

## Features

- **Terminal-native UI** — Built with Ink (React for CLIs), providing a
  responsive and interactive experience directly in your terminal.
- **Multiple Agents** — Switch between built-in and custom agents, each with
  configurable system prompts and tool permissions.
- **MCP Integration** — Connect to external tools and services via the Model Context Protocol (MCP).
- **Smart Tool Permissions** — Granular control over which tools each agent
  can use, with user-facing permission prompts for sensitive operations.
- **Session Management** — Persistent conversation history, token tracking, and automatic session summaries.
- **Session Checkpoints** — Every file edit is recorded as a checkpoint; restore
  any file to an earlier state with `mtc session revert`.
- **Code Editing Tools** — Read, write, edit, and search files; run bash commands; all tracked and permissioned.
- **Multi-LLM Routing** — Configure DeepSeek, OpenAI, Anthropic, or OpenRouter
  providers with automatic task classification and fallback.
- **Local LLM Support** — Run local models via llama.cpp (`llama-server`) for offline/private use.
- **Plugin System** — Load TypeScript/JavaScript plugins from `.mtc/plugins` or
  `~/.config/mtc/plugins`, each contributing custom tools.
- **Agent-driven Eval & Benchmarking** — Run the real agent loop against
  sandboxed tasks with `mtc eval run` and benchmark all tasks with
  `mtc eval bench`.
- **Webhook Security Gateway** — Constant-time signature validation for GitHub
  webhooks and token validation for GitLab; unauthenticated requests return 401.
- **Autonomous Daemon** — Headless webhook daemon that labels issues and opens
  draft PRs with fixes (GitHub only; GitLab webhooks are acknowledged but
  rejected).
- **Enterprise Edition** — Tiered licensing, audit logs, org management, and a
  web control-plane dashboard with real-time updates, analytics, and export
  capabilities.

## Prerequisites

- [Bun](https://bun.sh) v1.2+ (runtime)
- Git

## Installation

### From npm

```bash
npm install -g @metateam/cli
mtc --version
```

Requires **Bun** v1.2+ (https://bun.sh) to be installed.

### Quick Install (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/mtm-LazumLyntonTawngYung/metateam-code-agent/develop/install.sh | bash
```

Installs the latest pre-built binary to `/usr/local/bin`. Override the install directory:

```bash
MTC_INSTALL_DIR=~/.local/bin curl -fsSL ... | bash
```

### Cross-Platform (Build + Install)

```bash
git clone git@github.com:mtm-LazumLyntonTawngYung/metateam-code-agent.git
cd metateam-code-agent
bun install
bun run build
```

Then add the binary to your `PATH`:

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

### From Source (All Platforms)

```bash
git clone git@github.com:mtm-LazumLyntonTawngYung/metateam-code-agent.git
cd metateam-code-agent
bun install
bun run build    # compiles to bin/mtc.exe (or bin/mtc on Unix)
```

Add `bin/` to your `PATH`, or run directly:

```powershell
.\bin\mtc.exe --version     # Windows
./bin/mtc --version          # macOS / Linux
```

## Available Scripts

Run from the repository root with [Bun](https://bun.sh):

| Script | Description |
|--------|-------------|
| `bun run dev` | Start the TUI in development mode |
| `bun run build` | Compile a standalone binary to `bin/mtc` (Windows: `bin/mtc.exe`) |
| `bun run typecheck` | Run the TypeScript compiler with no emit |
| `bun test` | Run the test suite |
| `bun run test:coverage` | Run the test suite with coverage |
| `bun run test:eval` | Run the agent-driven evaluation suite |

## Usage

```bash
# Start the TUI
mtc

# Development (run from source without building)
bun run dev

# Build standalone binary
bun run build

# Type check
bun run typecheck

# Evaluate the agent against sandboxed tasks
mtc eval list                          # list available tasks
mtc eval run <task> --model <id>       # run a single task
mtc eval bench                         # benchmark all tasks

# Session checkpoints
mtc session patches <session>          # list recorded file edits
mtc session revert <session> <file> [version]   # restore a file

# Plugins
mtc plugin list
mtc plugin reload

# Diagnostics
mtc debug info

# Enterprise dashboard (requires license)
mtc enterprise dashboard -p 3000
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

LLM provider keys and routing are managed through the CLI
(stored in `~/.config/mtc/config.json`), not environment variables:

```bash
mtc llm status
mtc llm set-provider --id deepseek --key sk-...
mtc llm set-routing --simple deepseek-v4-flash --default deepseek-v4-flash --reasoning claude-sonnet-4-20250514
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

**Note:** Models with <7B parameters may not reliably support tool calling.
For full agent functionality (file editing, bash execution), use models
with 7B+ parameters.

### MCP Servers

MCP servers are loaded from:
1. `.mtc/mcp.json` in the current working directory
2. `~/.config/mtc/mcp.json` globally
3. OpenCode configuration files (`~/.config/opencode/opencode.json`, `~/.opencode/config.json`, `.opencode.json`)

### Custom Agents

Custom agents can be defined in `.mtc/agents/*.md` or
`~/.config/mtc/agents/*.md`. Each agent has a system prompt and permissions
(`read`, `bash`, `edit`, `execute`). New custom agents default to
`read: allow`, `edit/bash/execute: deny`. Frontmatter `permissions` are
honored explicitly (`allow`/`deny`).

### Rules

Project-specific rules in `.mtc/rules/` (and `AGENTS.md` at the project root)
are loaded and appended to the active agent's system prompt.

### Skills

Skills can be installed from the built-in catalog or from
`.mtc/skills/<id>/SKILL.md` (workspace) and `~/.mtc/skills/<id>/SKILL.md`
(global). Open them with `/skills`.

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

## Environment Variables

Most configuration lives in `~/.config/mtc/config.json` and is managed via
`mtc llm set-provider`. Environment variables are used for daemon credentials,
SSO, enterprise licensing, and bundled MCP bridges. See `.env.example` for the
full template.

| Variable | Purpose |
|----------|---------|
| `MTC_AZURE_CLIENT_ID` | Microsoft Entra ID client ID (SSO device-code flow) |
| `MTC_AZURE_TENANT_ID` | Microsoft Entra ID tenant ID |
| `MTC_AZURE_CLIENT_SECRET` | Optional; falls back to public-client flow when absent |
| `MTC_GITHUB_TOKEN` | GitHub token for the daemon (issues / draft PRs) |
| `MTC_GITLAB_TOKEN` | GitLab token for the daemon |
| `MTC_WEBHOOK_SECRET` | Secret used for webhook signature / token validation |
| `MTC_SLACK_WEBHOOK` | Slack notification webhook URL |
| `MTC_TEAMS_WEBHOOK` | Microsoft Teams notification webhook URL |
| `MTC_WS_TOKEN` | Auth token for the WebSocket server (`mtc serve`) |
| `MTC_LICENSE_SECRET` | Enterprise license signing / verification secret |
| `FIGMA_TOKEN` | Figma MCP bridge token |
| `DATADOG_API_KEY` / `DATADOG_APP_KEY` | Datadog MCP bridge keys |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS MCP bridge credentials |

## Project Structure

```
.
├── .mtc/                    # Workspace configuration (mcp.json, agents/, rules/, skills/)
├── src/
│   ├── cli.tsx              # CLI entry point (commander + Ink TUI)
│   ├── agents/              # Agent loop and agent definitions
│   ├── auth/                # SSO (Microsoft Entra ID) and token handling
│   ├── config/              # Configuration loading and validation
│   ├── daemon/              # Headless webhook daemon and autofix pipeline
│   ├── enterprise/          # Licensing, org management, control-plane dashboard
│   ├── eval/                # Agent-driven eval tasks and benchmarking
│   ├── init/                # Project scaffolding and templates
│   ├── llm/                 # Multi-LLM providers, routing, and cost tracking
│   ├── mcp/                 # Model Context Protocol server loading
│   ├── mcp-plugins/         # Bundled MCP bridges (Figma, Datadog, AWS, ...)
│   ├── multi-agent/         # Multi-agent orchestration and task routing
│   ├── plugins/             # Plugin extension system
│   ├── review/              # Automated code review (`mtc review`)
│   ├── secrets/             # Secret detection and redaction
│   ├── server/              # WebSocket server (`mtc serve`)
│   ├── session/             # Conversation history and file checkpoints
│   ├── shared-sessions/     # Collaboration / session sharing
│   ├── skills/              # Skills catalog and loader
│   ├── telemetry/           # Opt-in usage analytics
│   ├── tools/               # Agent tool implementations (read, write, bash, ...)
│   ├── ui/                  # Ink UI components
│   └── utils/               # Shared utilities
├── tests/
│   ├── evals/               # Sandboxed eval tasks
│   └── unit/                # Unit tests
├── bin/                     # Compiled binary (mtc / mtc.exe) and launcher
├── docs/                    # Internal documentation portal
├── examples/                # Example configs and plugins
├── .env.example             # Environment variable template
├── install.sh               # Quick install script (macOS / Linux)
└── package.json
```

## Security

- **Webhook validation** — GitHub signatures are verified with
  `crypto.timingSafeEqual` (constant-time comparison); GitLab tokens are
  validated similarly. Unauthenticated webhook requests return 401.
- **Clone URL validation** — Strict regex validation on repository clone URLs.
- **Path traversal prevention** — Resolved-path containment checks for LLM-written files in the autofix pipeline.
- **License verification** — HMAC-SHA256 license key verification with
  fail-closed behavior when `MTC_LICENSE_SECRET` is not set.
- **Auth token storage** — SSO tokens written with 0600 file permissions.
- **Cross-platform hardening** — CRLF normalization in file reads and MCP
  plugins; OS temp paths for daemon; `join()`-based path handling.

## Documentation

- **[Internal Documentation Portal](docs/internal/README.md)** — Onboarding, governance, architecture, workflows
- **[Internal Playbook](docs/playbook.md)** — Prompt engineering, agent usage, troubleshooting
- **[Migration Guide](docs/migration-guide.md)** — License format, SSO, agent permissions, and telemetry changes

## Contributing

See the [Contributing Guide](docs/internal/contributing.md) for the full
workflow (code of conduct, development setup, branch naming, commit
conventions, and the PR process). In short:

1. Branch as `feature/#<issue-number>-<short-description>`
2. Run `bun run typecheck` and `bun test` before opening a PR
3. Follow [Conventional Commits](https://www.conventionalcommits.org/)
4. Update the README and `CHANGELOG.md` for user-visible changes

## License

- Open-source edition: [MIT](LICENSE)
- Enterprise edition (SSO, org management, audit logs, control-plane dashboard):
  [LICENSE.ENTERPRISE](LICENSE.ENTERPRISE) with tiered licensing
