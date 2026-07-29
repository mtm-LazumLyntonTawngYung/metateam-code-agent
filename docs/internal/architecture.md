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
│   ├── PlanAgent        # Read-only exploration agent
│   ├── BuildAgent       # Full-access implementation agent
│   └── custom.ts        # Custom agent loader
├── config/              # Configuration loading (mcp.json, agents, rules)
├── eval/                # Eval/test runner
├── init/                # Project scaffolding (mtc init)
├── llm/                 # LLM client (OpenAI, Anthropic)
├── mcp/                 # MCP client and server management
│   ├── client.ts        # JSON-RPC MCP client
│   ├── config.ts        # MCP server configuration
│   └── registry.ts      # Tool registry from MCP servers
├── review/              # PR review (mtc review)
├── secrets/             # Secret redaction patterns
├── server/              # WebSocket server (mtc serve)
├── session/             # Session management + history (SQLite)
├── telemetry/           # Usage analytics
├── tools/               # Built-in tool implementations
│   ├── read.ts
│   ├── write.ts
│   ├── edit.ts
│   ├── glob.ts
│   ├── bash.ts
│   └── subagent.ts
├── ui/                  # Ink/React UI components
│   ├── app.tsx          # Main app component
│   ├── chat.tsx         # Chat view
│   ├── command-palette  # Ctrl+P command palette
│   └── permission.tsx   # Permission prompt UI
└── utils/               # Shared utilities
```

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
