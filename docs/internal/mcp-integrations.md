# MCP Integrations

Guide for adding and building MCP (Model Context Protocol) plugins for **mtc**.

---

## What is MCP?

MCP is a protocol that lets mtc connect to external tools and services.
MCP plugins are standalone processes that communicate with mtc via
JSON-RPC over stdin/stdout.

## Adding an Existing Plugin

1. Get the plugin's server file or install it
2. Register in `.mtc/mcp.json`:

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

3. Restart mtc
4. Verify: `/call list-tools`
5. Use: `/call my_tool param=value`

## Building a Plugin

Use the [MCP Plugin Scaffold](../templates/mcp-plugin-scaffold.ts).

### Quick Start

```bash
cp docs/templates/mcp-plugin-scaffold.ts my-plugin.ts
# Edit my-plugin.ts — implement your tool handlers
```

### Plugin Checklist

- [ ] Implements `initialize`, `tools/list`, `tools/call`
- [ ] Registers at least one tool with name, description, and parameters
- [ ] Handles errors gracefully
- [ ] Passes security review
- [ ] README with setup instructions
- [ ] Example tool calls in documentation

### Security Requirements

- No filesystem access outside declared scope
- No unexpected network calls
- No dynamic code execution (eval, etc.)
- All dependencies audited

## Available Plugins (Internal Registry)

| Plugin | Description | Maintainer |
|--------|-------------|------------|
| (List internal plugins here) | | |

See internal plugin registry for the full list.

## Plugin Lifecycle

1. **Proposal** — GitHub Issue with plugin spec
2. **Development** — Build and test locally
3. **Review** — Security + code review
4. **Registration** — Added to internal registry
5. **Maintenance** — Assigned steward, tracked in GitHub
