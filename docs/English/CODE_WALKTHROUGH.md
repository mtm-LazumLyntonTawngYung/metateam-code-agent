# Code Walkthrough

This document explains every major module, router, and utility in the codebase. Read this alongside the actual code to understand what each part does and why.

---

## Table of Contents

1. [CLI Entry Point (`src/cli.tsx`)](#srcclitsx)
2. [TUI Application (`src/ui/App.tsx`)](#srcuiapptsx)
3. [Agent System (`src/agents/`)](#srcagents)
4. [Tool Registry (`src/tools/`)](#srctools)
5. [LLM Layer (`src/llm/`)](#srcllm)
6. [MCP Client (`src/mcp/`)](#srcmcp)
7. [Session Management (`src/session/`)](#srcsession)
8. [Daemon (`src/daemon/`)](#srcdaemon)
9. [Enterprise (`src/enterprise/`)](#srcenterprise)
10. [Server (`src/server/`)](#srcserver)
11. [Shared Sessions (`src/shared-sessions/`)](#srcshared-sessions)
12. [Configuration (`src/config/`)](#srcconfig)

---

## `src/cli.tsx`

**Location**: `src/cli.tsx`

This is the main CLI entry point. It uses Commander.js to define all top-level commands and their options.

### Top-Level Commands

| Command | Description |
|---------|-------------|
| `mtc` (default) | Start the interactive Ink TUI |
| `eval list|run|bench` | Agent-driven evaluation and benchmarking |
| `analytics report|enable|disable|status` | Usage analytics management |
| `serve` | Start WebSocket server for editor integration |
| `daemon` | Start headless webhook daemon |
| `enterprise` | License, dashboard, audit, org management |
| `init [dir]` | Initialize a new project with `.mtc/` and rules |
| `review` | Run static code review |
| `llm status|set-provider|set-routing|classify|models` | LLM provider configuration |
| `auth logout` | Clear stored auth tokens |
| `session list|patches|revert` | Session and patch management |
| `plugin list|reload` | Plugin management |
| `debug info` | Debug information |

### Key Behavior

- Default action renders the Ink TUI (`src/ui/App.tsx`)
- Each subcommand is implemented in its own module under `src/`
- Global flags like `--verbose` and `--json` are handled centrally

---

## `src/ui/App.tsx`

**Location**: `src/ui/App.tsx`

The main Ink/React TUI application (~1180 lines). Manages views, overlays, agent loop, permissions, and telemetry.

### Views

| View | Purpose |
|------|---------|
| `home` | Landing screen with project info |
| `chat` | Main agent conversation view |
| `diff` | File patch review view |
| `connect` | LLM provider connection form |

### Overlays

| Overlay | Purpose |
|---------|---------|
| `agents` | Agent selector |
| `commands` | Command palette (`Ctrl+P` or `/`) |
| `models` | Model picker |
| `mcps` | MCP server manager |
| `skills` | Skill browser |
| `sessions` | Session history |
| `help` | Key bindings and help |
| `themes` | Theme picker |
| `collab` | Collaboration (share/join/participants) |
| `login` | SSO login screen |

### Key Components

- **Agent Loop**: Orchestrates the turn-by-turn interaction between user, tools, and LLM
- **Permission Prompt**: Pauses execution for sensitive operations (edit, bash, execute)
- **Status Bar**: Shows current agent, model, token usage, and connection status
- **Streaming Rendering**: Displays LLM responses token-by-token as they arrive

---

## `src/agents/`

**Location**: `src/agents/`

The agent system manages built-in and custom agents, rules loading, and subagent orchestration.

### Key Files

- **`index.ts`**: Agent initialization, switching, and rule loading
- **`builtin.ts`**: Built-in agent definitions (default, QA Tester, DevOps Engineer, Product Manager)
- **`custom.ts`**: Custom agent loader from `.mtc/agents/*.md`
- **`subagent.ts`**: Subagent orchestration for specialized tasks
- **`agent-loop.ts`**: The main agent loop that drives tool execution and LLM calls
- **`permissions.ts`**: Permission engine (`read`, `bash`, `edit`, `execute`)

### Agent Definition Format

Custom agents are defined in `.mtc/agents/*.md` or `~/.config/mtc/agents/*.md`:

```markdown
---
permissions:
  read: allow
  bash: ask
  edit: deny
  execute: deny
---

You are a senior QA engineer. Write tests, find bugs, and suggest fixes.
```

---

## `src/tools/`

**Location**: `src/tools/`

The tool registry contains 12+ built-in tools and supports plugin-registered tools.

### Built-in Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `read_file` | Read file contents | `read` |
| `write_file` | Write file contents | `edit` |
| `edit_file` | Edit file with search/replace | `edit` |
| `run_bash` | Execute shell commands | `bash` |
| `glob_files` | Find files by pattern | `read` |
| `grep_files` | Search file contents by regex | `read` |
| `websearch` | Search the web | `read` |
| `task` | Launch a subagent | `read` |
| `apply_patch` | Apply a unified diff patch | `edit` |
| `git_diff` | Show git diff | `read` |
| `git_commit` | Stage and commit changes | `bash` |
| `skill` | Open a skill | `read` |

### Tool Registration

Each tool has a Zod schema for input validation. Tools are registered in `src/tools/index.ts` and permissioned per-agent.

### Plugin System

Plugins can register additional tools via `src/plugins/index.ts`. Plugins support:
- `tools`: Additional tool definitions
- `setup`: Initialization hooks
- `beforeTool` / `afterTool`: Lifecycle hooks around tool execution

---

## `src/llm/`

**Location**: `src/llm/`

The LLM layer provides provider abstraction, task classification, routing, and fallback.

### Key Files

- **`config.ts`**: Provider configuration stored in `~/.config/mtc/config.json`
- **`client.ts`**: Chat completion client abstraction
- **`router.ts`**: Task classifier that routes queries to `simpleModel`, `defaultModel`, or `reasoningModel`
- **`fallback.ts`**: Provider fallback chain for resilience

### Supported Providers

| Provider | Config ID |
|----------|-----------|
| DeepSeek | `deepseek` |
| OpenAI | `openai` |
| Anthropic | `anthropic` |
| OpenRouter | `openrouter` |
| llama.cpp (local) | `llamacpp` |

### Routing Logic

The router classifies incoming queries by complexity:
- **Simple** (e.g., "what is 2+2?"): Routes to `simpleModel` (fast, cheap)
- **Default** (e.g., "explain this code"): Routes to `defaultModel`
- **Reasoning** (e.g., complex refactoring): Routes to `reasoningModel` (most capable)

If the primary provider fails, the fallback chain tries alternative providers.

---

## `src/mcp/`

**Location**: `src/mcp/`

The Model Context Protocol (MCP) client loads external tool servers and registers their tools into the local tool registry.

### MCP Server Discovery Order

1. `.mtc/mcp.json` in the current working directory
2. `~/.config/mtc/mcp.json` globally
3. OpenCode configuration files (`~/.config/opencode/opencode.json`, `~/.opencode/config.json`, `.opencode.json`)

### Supported Transports

- **stdio**: Spawns a child process and communicates over stdin/stdout
- **HTTP/SSE**: Connects to a remote MCP server over HTTP

### Example MCP Config

```json
{
  "servers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@figma/mcp-server"],
      "env": { "FIGMA_TOKEN": "your-token" }
    }
  }
}
```

---

## `src/session/`

**Location**: `src/session/`

Session management handles conversation history, file patches, token budgets, summaries, and turn stats.

### Key Features

- **Conversation History**: Persists Q&A turns for context continuity
- **File Patches**: Checkpoint/undo system for file edits within a session
- **Token Budgets**: Tracks token usage against session limits
- **Auto-Summaries**: Condenses long conversations to preserve context
- **Turn Stats**: Records latency, token counts, and tool usage per turn

---

## `src/daemon/`

**Location**: `src/daemon/`

The headless webhook daemon listens for GitHub (and GitLab) webhooks, clones repos, generates bug fixes via LLM, and opens draft PRs.

### Key Files

- **`webhook.ts`**: HTTP server (Bun.serve) with rate limiting and signature validation
- **`pipeline.ts`**: Autofix pipeline: clone → analyze → fix → test → commit → push → PR
- **`github.ts` / `gitlab.ts`**: Platform-specific event parsing and API interactions

### Autofix Pipeline

1. Receive webhook (e.g., GitHub issue labeled `autofix`)
2. Clone the repository to a temp directory
3. Analyze the issue with the LLM
4. Generate a code fix
5. Run tests (if configured)
6. Commit and push the fix
7. Open a draft PR with the fix

### Security

- GitHub signatures verified with `crypto.timingSafeEqual` (constant-time)
- GitLab tokens validated similarly
- Clone URLs validated with strict regex
- Path traversal prevention via resolved-path containment
- Secret redaction in logs

---

## `src/enterprise/`

**Location**: `src/enterprise/`

Proprietary enterprise modules for organizations that need advanced features.

### Modules

| Module | Purpose |
|--------|---------|
| `license` | HMAC-SHA256 license key verification and tier gating |
| `audit` | Audit log collection and querying |
| `org` | Organization management (create, list, members) |
| `rbac` | Role-based access control |
| `notifications` | Slack/Teams webhook notifications |
| `dashboard` | Web control-plane dashboard with real-time updates |
| `analytics` | Usage analytics and exports |

### License Format

Keys use the canonical format: `MTC-<tier>-<base64url(payload)>-<hmac>`

Verified with HMAC-SHA256 against `MTC_LICENSE_SECRET`. Fail-closed behavior when the secret is not set.

---

## `src/server/`

**Location**: `src/server/`

The WebSocket server (`mtc serve`) enables VS Code and other editor clients to connect to the agent.

### Key Features

- WebSocket auth via `MTC_WS_TOKEN`
- Rate limiting per connection
- Session management
- Message types: `query`, `tool_call`, `permission`, `status`

### VS Code Extension

The extension (`vscode-mtc/`) connects to this server and provides:
- Sidebar webview for chat
- Status bar item showing connection state
- Commands: connect, disconnect, focus sidebar, send selection as query
- Auto-reconnect with exponential backoff

---

## `src/shared-sessions/`

**Location**: `src/shared-sessions/`

The collaborative session engine enables real-time multi-user support.

### Key Features

- **Participants**: Join/leave sessions with roles
- **Permissions**: Granular operation permissions per participant
- **Operations**: Typing indicators, cursor sharing, patch proposals
- **Conflict Resolution**: Merge strategies for concurrent edits
- **Offline Sync**: Queue operations when disconnected
- **Event Bus**: Pub/sub for real-time updates
- **Security**: HMAC-signed tokens, rate limiting, input validation
- **API Gateway**: REST endpoints for session management
- **Performance**: Operation batching and throttling

---

## `src/config/`

**Location**: `src/config/`

Configuration loading and merging for global and project-local settings.

### Config Locations

| Scope | Path | Purpose |
|-------|------|---------|
| Global | `~/.config/mtc/config.json` | User-level settings |
| Project | `.mtc/config.json` | Project-level overrides |

### Config Schema

```ts
type MtcConfig = {
  apiKey?: string;
  endpoint?: string;
  selectedModel?: string;
  agentId?: string;
  installedSkills?: string[];
  telemetry?: { enabled: boolean; endpoint?: string; deviceId: string };
  llm?: Record<string, unknown>;
  license?: Record<string, unknown>;
  auth?: { clientId?: string; tenantId?: string; clientSecret?: string };
  organization?: { name?: string };
  themeId?: string;
  webSearch?: { enabled?: boolean };
  permissions?: { rules?: Array<{ tool: string; action: "allow" | "ask" | "deny" }>; alwaysAllow?: string[] };
};
```

Project config is merged with global config; project values take precedence.

---

## `src/init/`

**Location**: `src/init/`

Project initialization (`mtc init`) creates the `.mtc/` directory structure, `AGENTS.md`, and default rules for a new project.

---

## `src/review/`

**Location**: `src/review/`

Static code review tool (`mtc review`) that scans for:
- Hardcoded secrets and API keys
- Debug artifacts (`console.log`, `debugger`)
- Line length violations
- Missing mandatory files (e.g., `README.md`, `.gitignore`)

Outputs findings in human-readable or JSON format.

---

## `src/secrets/`

**Location**: `src/secrets/`

Secret redaction engine that detects and masks sensitive values in:
- Daemon logs
- Review output
- LLM prompts and responses

Uses regex patterns for common secret formats (API keys, tokens, passwords).

---

## `src/telemetry/`

**Location**: `src/telemetry/`

Opt-in usage analytics. When enabled, collects:
- Command usage patterns
- Model selection
- Feature usage (MCP, skills, sessions)
- Crash reports (without file contents, prompts, or responses)

Data is stored locally and never includes sensitive information.

---

## `src/utils/`

**Location**: `src/utils/`

Shared utilities:
- **Logger**: Structured logging with timestamps and levels
- **Updater**: Self-update checker for the CLI binary
- **Security**: Path validation, hash utilities, safe comparisons

---

## Summary: How the Pieces Fit Together

```
src/cli.tsx
    └── parses commands with Commander.js
        │
        ├── default: renders Ink TUI (src/ui/App.tsx)
        │       └── manages agent loop, permissions, overlays
        │           ├── src/agents/ (agent selection, rules, subagents)
        │           ├── src/tools/ (tool execution with permission checks)
        │           ├── src/llm/ (provider routing, streaming responses)
        │           ├── src/mcp/ (external tool servers)
        │           ├── src/session/ (conversation history, patches)
        │           └── src/skills/ (built-in skill catalog)
        │
        ├── mtc serve: starts WebSocket server (src/server/)
        │       └── VS Code extension connects here
        │
        ├── mtc daemon: starts webhook server (src/daemon/)
        │       └── GitHub/GitLab webhooks → autofix pipeline
        │
        ├── mtc enterprise: license, dashboard, audit (src/enterprise/)
        │
        ├── mtc eval: agent-driven evaluation (src/eval/)
        │
        ├── mtc init: project scaffolding (src/init/)
        │
        ├── mtc review: static code review (src/review/)
        │
        └── mtc llm: provider configuration (src/llm/)
```
