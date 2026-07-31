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
- **Autonomous Daemon** — Headless webhook daemon that labels issues and opens draft PRs with fixes.
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
