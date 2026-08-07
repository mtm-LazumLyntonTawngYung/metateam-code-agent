# Agent Pipeline Explained

This document explains the complete agent pipeline as implemented in this project. Each stage is described with its purpose, the code that implements it, and why the design decisions were made.

---

## High-Level Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     AGENT PIPELINE                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INPUT PHASE                                                     │
│                                                                  │
│  User Input → Agent Selection → Permission Check → Tool Choice   │
│                                                                  │
│  EXECUTION PHASE                                                 │
│                                                                  │
│  Tool Execution → Result → LLM Call → Streaming Response        │
│                                                                  │
│  PERSISTENCE PHASE                                               │
│                                                                  │
│  Save Turn → Update Session → Optional Summary                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: CLI Entry and TUI Launch

**File**: `src/cli.tsx`

When the user runs `mtc` with no arguments, the CLI launches the Ink TUI.

### What Happens

1. Commander.js parses the command line
2. No subcommand is matched, so the default action runs
3. The default action renders the Ink `<App>` component from `src/ui/App.tsx`
4. Ink takes over the terminal and renders React components
5. The TUI enters an event loop, waiting for user input

### Why a TUI?

A terminal UI provides:
- Low-latency interaction without browser overhead
- Direct access to the filesystem and shell
- Consistent experience across platforms
- Familiar key bindings for developers

---

## Stage 2: Agent Selection

**File**: `src/agents/index.ts`

Before the agent loop starts, the user (or default config) selects an agent.

### What Happens

1. The TUI loads the default agent from config or falls back to the built-in default
2. Custom agents are loaded from `.mtc/agents/*.md` or `~/.config/mtc/agents/*.md`
3. Each agent's frontmatter is parsed for permissions
4. The system prompt is assembled from the agent's Markdown body + loaded rules
5. Rules from `.mtc/rules/` and `AGENTS.md` are appended to the system prompt

### Why Separate Agents?

Different tasks require different behaviors:
- A **QA Tester** agent should focus on finding bugs and writing tests
- A **DevOps Engineer** agent should focus on infrastructure and deployment
- A **Product Manager** agent should focus on requirements and documentation

Permissions ensure that sensitive operations (like `run_bash` or `edit_file`) are restricted based on the agent's role.

---

## Stage 3: User Input and Agent Loop

**File**: `src/ui/App.tsx`, `src/agents/agent-loop.ts`

When the user types a message and presses Enter, the agent loop begins.

### What Happens

1. The user's message is added to the conversation history
2. The agent loop constructs a prompt for the LLM:
   - System message (agent's instructions + rules)
   - Conversation history (last N turns)
   - Current user message
3. The LLM is called with streaming enabled
4. The response is rendered token-by-token in the TUI
5. If the LLM requests a tool call, the loop pauses for permission

### Tool Call Decision

The LLM can respond in two ways:
- **Text response**: The agent outputs text directly to the user
- **Tool call**: The agent requests to execute a tool (e.g., `read_file`, `run_bash`)

When a tool call is requested:
1. The tool name and arguments are extracted
2. The agent's permissions are checked
3. If permission is `deny`, the tool call is rejected
4. If permission is `ask`, the user is prompted to accept or reject
5. If permission is `allow`, the tool is executed immediately

---

## Stage 4: Tool Execution

**File**: `src/tools/index.ts`

When a tool call is approved, the tool is executed.

### What Happens

1. The tool registry looks up the tool by name
2. Input arguments are validated against the Zod schema
3. The tool function is called with validated arguments
4. The result is returned to the agent loop
5. The result is formatted and added to the conversation history
6. The LLM is called again to process the result and decide the next step

### Built-in Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `read_file` | Read file contents | `read_file({ path: "src/cli.tsx" })` |
| `write_file` | Write file contents | `write_file({ path: "test.txt", content: "hello" })` |
| `edit_file` | Edit file with search/replace | `edit_file({ path: "src/cli.tsx", old: "foo", new: "bar" })` |
| `run_bash` | Execute shell commands | `run_bash({ command: "npm test" })` |
| `glob_files` | Find files by pattern | `glob_files({ pattern: "**/*.ts" })` |
| `grep_files` | Search file contents | `grep_files({ pattern: "function", path: "src" })` |
| `websearch` | Search the web | `websearch({ query: "Bun runtime docs" })` |
| `task` | Launch a subagent | `task({ prompt: "Review this code", agent: "qa-tester" })` |
| `apply_patch` | Apply a unified diff | `apply_patch({ patch: "..." })` |
| `git_diff` | Show git diff | `git_diff({ path: "." })` |
| `git_commit` | Stage and commit | `git_commit({ message: "fix: update config" })` |
| `skill` | Open a skill | `skill({ id: "code-review" })` |

### Plugin Tools

Plugins can register additional tools via `src/plugins/index.ts`. Plugin tools are loaded at startup and merged into the tool registry.

---

## Stage 5: LLM Call and Streaming

**File**: `src/llm/client.ts`, `src/llm/router.ts`

After each tool execution (or user message), the LLM is called again.

### What Happens

1. The router classifies the query complexity (simple, default, reasoning)
2. The appropriate model is selected
3. If the primary provider fails, the fallback chain is tried
4. The LLM is called with `stream: true`
5. Tokens arrive as a stream and are rendered in the TUI in real-time
6. If the response contains a tool call, the loop returns to Stage 4
7. If the response is text, the loop ends and the turn is saved

### Streaming Architecture

```
User Input
    │
    ▼
LLM Request (stream: true)
    │
    ▼
Token 1 → Render in TUI
Token 2 → Render in TUI
Token 3 → Render in TUI
...
Token N → Render in TUI
    │
    ▼
Response Complete
```

The streaming response is buffered and rendered character-by-character for a smooth typing effect.

---

## Stage 6: Permission Checks

**File**: `src/agents/permissions.ts`

Before every tool execution, the agent's permissions are checked.

### Permission Levels

| Level | Behavior |
|-------|----------|
| `allow` | Execute without asking |
| `ask` | Prompt the user for confirmation |
| `deny` | Reject the tool call |

### Permission Sources

1. **Agent frontmatter**: `.mtc/agents/*.md` defines default permissions
2. **Global rules**: `~/.config/mtc/permissions.json` can override
3. **Runtime prompts**: The TUI shows `y` (accept), `n` (reject), `a` (always allow)

### Why Permission Checks?

AI agents are powerful but can be dangerous. Permission checks ensure:
- Users retain control over file modifications
- Sensitive operations (bash, git push) require explicit approval
- Compliance with organizational security policies

---

## Stage 7: Session Persistence

**File**: `src/session/index.ts`

After each turn, the conversation is saved to a SQLite database.

### What Is Saved

- **User message**: The text input
- **Tool calls**: Name, arguments, and result
- **LLM response**: The complete text response
- **Metadata**: Timestamp, token usage, model used, latency

### Session Features

| Feature | Purpose |
|---------|---------|
| **History** | Continue conversations across TUI restarts |
| **Patches** | Undo/redo file edits within a session |
| **Summaries** | Auto-summarize old turns to save context window |
| **Token Budgets** | Warn when approaching context limits |

---

## Stage 8: MCP Integration

**File**: `src/mcp/index.ts`

MCP servers are loaded at startup and their tools are merged into the local tool registry.

### What Happens

1. MCP config files are discovered (project, global, OpenCode)
2. Each MCP server is started (stdio) or connected (HTTP)
3. The server's tools are listed and registered locally
4. MCP tools appear in the agent's tool list alongside built-in tools
5. When the agent calls an MCP tool, the request is forwarded to the MCP server
6. The result is returned to the agent loop

### Example MCP Tools

- **Figma**: Query design tokens and components
- **Datadog**: Query metrics and logs
- **AWS**: Manage S3 buckets, EC2 instances
- **PostgreSQL**: Run read-only database queries

---

## Stage 9: Headless Daemon Mode

**File**: `src/daemon/webhook.ts`, `src/daemon/pipeline.ts`

The daemon runs without a TUI, listening for webhooks.

### What Happens

1. `mtc daemon` starts a Bun.serve HTTP server
2. The server listens for GitHub/GitLab webhooks on a configured port
3. Incoming webhooks are validated (signature, IP allowlist, rate limit)
4. For GitHub `issues` events with the `autofix` label:
   - The repo is cloned to a temp directory
   - The issue is analyzed by the LLM
   - A fix is generated and applied
   - Tests are run (if configured)
   - A draft PR is opened with the fix
5. Slack/Teams notifications are sent on completion or failure

### Why a Daemon?

The daemon enables fully autonomous code repair:
- Developers label issues with `autofix`
- The daemon picks them up automatically
- Fixes are proposed as draft PRs for human review
- No terminal or manual intervention required

---

## Stage 10: VS Code Extension

**File**: `src/server/ws.ts`, `vscode-mtc/src/extension.ts`

The WebSocket server enables editor integration.

### What Happens

1. `mtc serve` starts a WebSocket server
2. The VS Code extension connects via WebSocket
3. The extension sends queries, selected code, and file context
4. The server forwards requests to the agent loop
5. Responses are streamed back to the extension
6. The extension renders them in a sidebar webview

### Why WebSocket?

WebSocket provides:
- Full-duplex communication (server can push updates)
- Low overhead compared to HTTP polling
- Natural fit for streaming responses

---

## Data Flow Summary

```
User types in TUI
    │
    ▼
[Agent Loop] → assembles prompt with system message + history
    │
    ▼
[LLM Router] → classifies query, selects model, calls LLM
    │
    ▼
LLM response:
    ├── Text → render in TUI, save turn
    └── Tool call → [Permission Check]
            │
            ├── denied → inform LLM, retry
            ├── ask → prompt user, proceed or cancel
            └── allowed → [Tool Execution]
                    │
                    ▼
                [Tool Registry] → validate args, execute tool
                    │
                    ▼
                [Result] → add to history, call LLM again
                    │
                    ▼
                Loop back until LLM outputs text
```

---

## Key Design Decisions

| Decision | Reasoning |
|----------|-----------|
| Terminal-first UI | Low latency, direct filesystem access, cross-platform |
| Permissioned tools | Safety and control for autonomous code editing |
| Streaming LLM responses | Better UX, perceived performance |
| SQLite for sessions | Lightweight, serverless, portable |
| MCP for external tools | Standard protocol, extensible without core changes |
| Daemon for webhooks | Fully autonomous operation without manual intervention |
| WebSocket for editor | Real-time, bidirectional, low overhead |
