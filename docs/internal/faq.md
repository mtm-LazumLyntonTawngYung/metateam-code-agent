# Internal FAQ

Frequently asked questions about using **mtc** at MetaTeam.

---

## General

### What is mtc?

MTC (MetaTeam Code Agent) is an AI-powered, terminal-first coding assistant.
It reads your codebase, reasons about changes, writes files, and runs commands.
Unlike autocomplete tools that suggest tokens, mtc executes multi-step plans.

### How is mtc different from GitHub Copilot / Cursor?

| Feature | mtc | Copilot | Cursor |
|---------|-----|---------|--------|
| Multi-step planning | Yes | No | Limited |
| Custom agents | Yes | No | No |
| MCP integrations | Yes | No | No |
| Terminal-native TUI | Yes | No | No |
| Permission system | Yes | No | No |
| Session history | Yes | No | Yes |
| Local execution | Yes | No | Yes |

### Is mtc free for MetaTeam engineers?

Yes. mtc is built and maintained by MetaTeam for internal use.
There is no per-engineer cost.

## Setup

### What LLM provider should I use?

Your choice. mtc supports **DeepSeek, OpenAI, Anthropic, and OpenRouter**.
For most tasks we recommend DeepSeek Chat or GPT-4o for the best balance of
speed and quality. Configure providers with `mtc llm set-provider`.

### Do I need to install anything besides Bun?

No. Bun is the only prerequisite. mtc bundles everything else.

### Can I use mtc without an internet connection?

mtc requires an LLM API, which needs internet. However, you can use mtc
for local tasks (file navigation, code review) if you run a local model.

## Usage

### When should I use Plan vs Build mode?

- **Plan:** Exploring code, designing architecture, planning refactors (read-only)
- **Build:** Implementing, fixing bugs, writing code (full access)

Rule of thumb: If you're not 100% sure what to do, start with Plan.

### Can I create my own agents?

Yes. Create a `.md` file in `.mtc/agents/` with frontmatter defining
the agent's name, permissions, and system prompt. See the [Playbook](../playbook.md)
for examples.

### Can I connect mtc to internal tools?

Yes, via MCP plugins. Build a server that speaks JSON-RPC over stdin/stdout,
then register it in `.mtc/mcp.json`. See [MCP Integrations](./mcp-integrations.md).

## Security

### Does mtc send my code to external servers?

mtc sends code to the configured LLM provider for processing. It does not
send code anywhere else. Telemetry is opt-in and contains no code content.

### Can mtc modify files without my permission?

No. Every write, edit, and bash command requires user confirmation by default.
You can configure agents to auto-approve specific operations.

### Is session history stored securely?

Session history is stored locally in `~/.config/mtc/history.db`. API keys and
secrets are redacted before storage. The database is not encrypted at rest (yet).

## Troubleshooting

### mtc feels slow. What can I do?

- Use a faster model
- Reduce context — read fewer files per session
- Restart mtc to clear accumulated context
- Check your network latency to the LLM provider

### I found a bug. Where do I report it?

File a GitHub Issue. Use the bug report template and include:
- `mtc --version`
- Steps to reproduce
- Expected vs actual behavior
- Terminal output (with secrets redacted)

## Community

### How do I request a feature?

File a GitHub Issue with the `feature` label. Feature requests are triaged
weekly by the core maintainers.

### How do I contribute?

See [Contributing](./contributing.md). We welcome PRs for bug fixes,
documentation, and new features.

### Who do I contact for help?

- **Slack:** #mtc-users
- **Office hours:** Wednesdays 2pm ET
- **GitHub Issues:** For bugs and feature requests
