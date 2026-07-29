# Configuration Guide

How to configure **mtc** for your project.

---

## .mtc/ Directory

The `.mtc/` directory at your project root contains all mtc configuration:

```
.mtc/
├── mcp.json          # MCP server connections
├── agents/           # Custom agent definitions
└── rules/            # Project-specific rules
```

Scaffold it: `mtc init`

## MCP Servers (mcp.json)

MCP servers are loaded from:
1. `.mtc/mcp.json` in the current directory
2. `~/.config/mtc/mcp.json` globally

```json
{
  "mcpServers": {
    "my-plugin": {
      "command": "bun",
      "args": ["run", "path/to/server.ts"]
    }
  }
}
```

## Custom Agents

Create `.mtc/agents/<name>.md`:

```markdown
---
name: My Agent
mode: subagent
permissions:
  read: allow
  bash: allow
  edit: deny
---
```

See the [Playbook](../playbook.md) for examples.

## Project Rules

Create `.mtc/rules/<name>.md` to append to the agent's system prompt:

```markdown
## Project Rules
- All new functions must have JSDoc
- Use const over let
- Keep files under 400 lines
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | One of these |
| `ANTHROPIC_API_KEY` | Anthropic API key | One of these |
| `GITHUB_TOKEN` | GitHub token | For review features |
| `MTC_NO_EMOJI` | Disable emoji in TUI | No |
| `MTC_DEBUG` | Enable debug logging | No |
