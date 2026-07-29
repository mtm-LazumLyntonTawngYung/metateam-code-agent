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
git clone git@github.com:metateam/mtc.git
cd mtc
bun install
bun run build
```

Verify installation:

```bash
mtc --version
# mtc 0.1.0
```

## Step 2: Configure Credentials

### LLM API Key

Set your preferred LLM provider key:

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Or Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Or add to .env in project root
echo "OPENAI_API_KEY=sk-..." >> .env
```

### GitHub Token (for review features)

```bash
export GITHUB_TOKEN="ghp_..."
```

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

## Step 6: Verify MCP Connectivity

Check that your MCP servers are connected:

```
/call list-tools
```

You should see the built-in tools: `read`, `write`, `edit`, `glob`, `bash`, `subagent`.

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
- [ ] LLM API key configured
- [ ] `mtc` runs without errors
- [ ] VS Code extension installed (optional)
- [ ] MCP servers connected
