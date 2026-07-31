# Developer Onboarding Guide

Get up and running with **mtc** in under 15 minutes.

---

## Prerequisites

- [Bun](https://bun.sh) v1.2+ (runtime)
- Git
- Access to the MetaTeam GitHub organization
- VS Code (optional, for the extension)

## Step 1: Clone & Install

```bash
git clone git@github.com:mtm-LazumLyntonTawngYung/metateam-code-agent.git
cd metateam-code-agent
bun install
bun run build
```

Verify installation:

```bash
mtc --version
# 1.0.0
```

## Step 2: Configure LLM Provider

mtc needs an LLM provider key. Provider keys are stored in
`~/.config/mtc/config.json` via the CLI (not environment variables):

```bash
# List known providers
mtc llm status

# Add a provider (deepseek | openai | anthropic | openrouter)
mtc llm set-provider --id deepseek --key sk-...
```

Alternatively, run `mtc` and use `/connect` to add a provider through the TUI.

## Step 3: First Session

```bash
mtc
```

You'll see the TUI with two default agents:
- **Plan** (read-only) — for exploration and architecture
- **Build** (full access) — for implementation

Press `Tab` to switch between agents.

Try your first command:

```
/read README.md
```

## Step 4: Project Configuration

Each MetaTeam project should have an `.mtc/` directory:

```bash
mtc init
```

This scaffolds:
- `.mtc/mcp.json` — MCP server connections
- `.mtc/agents/` — Custom agent definitions
- `.mtc/rules/` — Project-specific rules

## Step 5: VS Code Extension (Optional)

```bash
# From the mtc repo
cd vscode-mtc
bun install
bun run build
```

Then install the `.vsix` from the build output.

Or install from the VS Code marketplace (internal).

## Step 6: Verify Connectivity

Check that everything is connected:

```
/status
```

You should see your tier, connected MCP server count, and feature
availability. Use `/mcps` to inspect individual MCP servers.

## Next Steps

| Resource | Description |
|----------|-------------|
| [Playbook](../playbook.md) | Prompt engineering and workflow patterns |
| [Command Reference](./commands.md) | All CLI commands |
| [AI Workflows](./ai-workflows.md) | Plan/Build workflow guide |
| [FAQ](./faq.md) | Common questions |
| #mtc-users (Slack) | Ask questions |

## Environment Checklist

- [ ] Bun installed (`bun --version`)
- [ ] Repository cloned
- [ ] `bun install` completed
- [ ] LLM provider configured (`mtc llm status`)
- [ ] `mtc` runs without errors
- [ ] VS Code extension installed (optional)
- [ ] MCP servers connected (check `/status`)
