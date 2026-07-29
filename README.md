# metateam-code-agent

AI-powered, terminal-first coding assistant tailored for MetaTeam engineers to accelerate development, refactoring, and code reviews.

## Features

- **Terminal-native UI** — Built with Ink (React for CLIs), providing a responsive and interactive experience directly in your terminal.
- **Multiple Agents** — Switch between built-in and custom agents, each with configurable system prompts and tool permissions.
- **MCP Integration** — Connect to external tools and services via the Model Context Protocol (MCP).
- **Smart Tool Permissions** — Granular control over which tools each agent can use, with user-facing permission prompts for sensitive operations.
- **Session Management** — Persistent conversation history, token tracking, and automatic session summaries.
- **Code Editing Tools** — Read, write, edit, and search files; run bash commands; all tracked and permissioned.

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
| `Tab` | Switch agents |
| `Ctrl+P` | Open command palette |
| `Esc` | Go back / close overlays |

## Configuration

### MCP Servers

MCP servers are loaded from:
1. `.mtc/mcp.json` in the current working directory
2. `~/.config/mtc/mcp.json` globally

### Custom Agents

Custom agents can be defined in your project configuration. Each agent has a system prompt, permissions, and can operate as a primary or subagent.

### Rules

Project-specific rules can be loaded and are appended to the active agent's system prompt.

## Documentation

- **[Internal Documentation Portal](docs/internal/README.md)** — Onboarding, governance, architecture, workflows
- **[Internal Playbook](docs/playbook.md)** — Prompt engineering, agent usage, troubleshooting
- **[Hackathon Guide](docs/hackathon.md)** — Building subagents and MCP plugins

## Development

This project uses:
- [Bun](https://bun.sh) as the runtime
- [Ink](https://github.com/vadimdemedes/ink) for the TUI
- [TypeScript](https://www.typescriptlang.org/) for type safety

## License

MIT
