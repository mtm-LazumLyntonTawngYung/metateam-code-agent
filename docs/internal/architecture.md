# Architecture Overview

System design, module structure, and data flow for **mtc**.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Terminal UI                       │
│                (Ink / React + Commander)              │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────┐  ┌─────────┐  ┌──────────────────────┐ │
│  │  Plan   │  │  Build  │  │   Custom Agents      │ │
│  │  Agent  │  │  Agent  │  │   (.mtc/agents/*.md) │ │
│  └────┬────┘  └────┬────┘  └──────────┬───────────┘ │
│       │            │                  │              │
│       └────────────┴──────────────────┘              │
│                        │                              │
│              ┌─────────▼──────────┐                  │
│              │    Tool Registry    │                  │
│              │  (permissions +     │                  │
│              │   tool routing)     │                  │
│              └─────────┬──────────┘                  │
│                        │                              │
│  ┌─────────┬───────────┼───────────┬──────────────┐  │
│  │         │           │           │              │  │
│  ▼         ▼           ▼           ▼              ▼  │
│ Read    Write    Edit     Glob     Bash      MCP   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Module Structure

```
src/
├── cli.tsx              # Entry point, CLI setup with Commander
├── agents/              # Agent definitions and execution
│   ├── builtin.ts       # Plan, Build, Explore agents
│   ├── custom.ts        # Custom agent loader (.mtc/agents/*.md)
│   ├── agent-loop.ts    # LLM agent loop (tool-call parsing, permissions)
│   ├── subagent.ts      # Subagent runner (/subagent)
│   ├── rules.ts         # Project rules (.mtc/rules, AGENTS.md)
│   └── frontmatter.ts   # Markdown frontmatter parser
├── auth/                # Microsoft Entra ID SSO (device-code flow)
├── config/              # Global config (~/.config/mtc/config.json)
├── daemon/              # Headless autofix daemon, webhooks, notifiers
├── enterprise/          # License, audit logs, orgs, web dashboard
├── eval/                # Eval runner (mtc eval)
├── init/                # Project scaffolding (mtc init)
├── llm/                 # LLM clients, routing, fallback
├── mcp/                 # MCP client, config, tool registry
├── mcp-plugins/         # Bundled bridges (figma, devops)
├── review/              # SQA review (mtc review)
├── secrets/             # Secret redaction patterns
├── server/              # WebSocket server (mtc serve)
├── session/             # SQLite session history, tokens, summaries
├── skills/              # Skill catalog, registry, install state
├── telemetry/           # Local telemetry store (mtc analytics)
├── tools/               # Built-in tool implementations
│   ├── read_file.ts
│   ├── write_file.ts
│   ├── edit_file.ts
│   ├── glob_files.ts
│   ├── run_bash.ts
│   └── permissions.ts
├── ui/                  # Ink/React UI components
│   ├── App.tsx          # Main app component
│   ├── ChatView.tsx     # Chat view
│   ├── CommandPalette.tsx
│   ├── PermissionPrompt.tsx
│   └── components/      # Header, Sidebar, Statusbar, InputBox
└── utils/               # Shared utilities (updater, etc.)
```

In addition to the terminal UI, `src/` contains headless subsystems driven by
the CLI: `mtc serve` (WebSocket), `mtc daemon` (autofix webhook server), and
`mtc enterprise dashboard` (web control plane).

## Data Flow

### Tool Call Lifecycle

```
User Input
    │
    ▼
Agent processes input with LLM
    │
    ▼
Agent emits tool call (e.g., /read src/index.ts)
    │
    ▼
Tool Registry validates permissions
    │
    ├─ Permission denied → Error returned to agent
    └─ Permission granted
            │
            ▼
        Execute tool
            │
            ▼
        Result returned to agent
            │
            ▼
        Agent continues processing
```

### Session Lifecycle

```
Session Start
    │
    ▼
Load config (.mtc/mcp.json, agents, rules)
    │
    ▼
Start MCP servers
    │
    ▼
Initialize agents (Plan + Build + custom)
    │
    ▼
Main loop:
    ├─ Display UI
    ├─ Wait for user input
    ├─ Route to active agent
    ├─ Execute tool calls
    └─ Log to session history
    │
    ▼
Session End → Save history to SQLite
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Terminal-native (Ink)** | Faster than VS Code extension, works in SSH/CI |
| **Bun runtime** | Fast startup, TypeScript-native, cross-platform |
| **MCP for plugins** | Language-agnostic, sandboxed subprocesses |
| **SQLite for history** | Zero-config, local-first, no dependencies |
| **Command pattern for tools** | Consistent interface for all tool types |
| **Frontmatter agent definitions** | Simple, Git-friendly, no DSL to learn |

## Deprecation Policy

Breaking changes require one minor version notice. See [Release Process](./release-process.md).
