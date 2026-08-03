# MTC Internal Hackathon

## Overview

The MTC Internal Hackathon is a team event where MetaTeam engineers build
specialized subagents and MCP plugins for mtc. The goal is to extend the agent's
capabilities and create reusable tools for the whole organization.

**Format:** 2-day virtual event
**Team size:** 2-3 engineers
**Delivery:** Working subagent or MCP plugin published to the team registry

---

## Timeline

### Day 1 — Build

| Time | Activity |
|------|----------|
| 09:00 | Kickoff: project intro, tooling setup, team formation |
| 09:30 | Workshop: Writing subagents (30 min talk) |
| 10:00 | Workshop: MCP plugin development (30 min talk) |
| 10:30 | Hacking begins |
| 12:30 | Lunch |
| 14:00 | Mid-day standup (what you're building, blockers) |
| 17:00 | End of Day 1 |

### Day 2 — Polish & Present

| Time | Activity |
|------|----------|
| 09:00 | Hacking continues |
| 11:00 | Code freeze — no more changes |
| 11:00-12:00 | Demos (5 min per team) |
| 12:00 | Judging & awards |
| 12:30 | Lunch |

---

## Project Ideas

### Subagent Ideas

| Idea | Description | Difficulty |
|------|-------------|------------|
| **SQL Query Generator** | Describe what you need in English, get optimized SQL | Easy |
| **API Mock Server** | From an OpenAPI spec, generate a running mock server | Medium |
| **Log Analyzer** | Paste logs, get root cause analysis | Easy |
| **Code Documenter** | Scan a module, produce README + JSDoc | Medium |
| **PR Description Writer** | From a diff, generate a PR description | Easy |
| **Database Migrator** | Compare two schemas, generate migration scripts | Medium |
| **Test Data Factory** | From a type definition, generate test fixtures | Easy |
| **Dependency Graph Visualizer** | Analyze imports, produce Mermaid graph | Hard |
| **i18n Manager** | Scan for hardcoded strings, generate translation files | Medium |
| **Performance Profiler** | Run benchmarks, produce before/after comparison | Hard |

### MCP Plugin Ideas

| Idea | Description | Difficulty |
|------|-------------|------------|
| **JIRA Connector** | Create/query tickets, link PRs | Medium |
| **Slack Notifier** | Post build status to Slack channels | Easy |
| **Database Inspector** | Connect to PostgreSQL/MySQL, run queries | Medium |
| **Docker Manager** | Build, run, stop containers | Easy |
| **S3 File Browser** | List, upload, download from S3 | Medium |
| **GitHub Issues** | Query, create, update issues from mtc | Easy |
| **PagerDuty Alert** | Trigger or acknowledge incidents | Medium |
| **Feature Flag Manager** | Toggle flags via API | Easy |
| **CI Pipeline Trigger** | Start builds, check status | Easy |
| **Cost Calculator** | Estimate AWS/Azure costs from config | Hard |

---

## Building a Subagent

### Template

Create a file at `.mtc/agents/<name>.md`:

```markdown
---
name: <Agent Name>
mode: subagent
permissions:
  read: allow
  bash: allow
  edit: deny
  execute: deny
---

You are a <description of what the agent does>.

## Tools Available
- /read — Read files in the project
- /glob — Search for files
- /call — Call any registered tool (respects permissions)

Subagents execute tool commands only — `/read`, `/glob`, and `/call` — and
return the results. They do not run free-form prompts or the agent loop.

## Behavior Rules
1. <rule 1>
2. <rule 2>
3. <rule 3>

## Output Format
<expected output format — markdown, JSON, etc.>
```

### Testing Your Subagent

```bash
# Load the agent and try it
mtc

# Select your subagent in the Agent selector (Tab) — it pre-fills /subagent
# Or run it directly:
/subagent <name> /read src/index.ts
```

### Submission Requirements

- Agent `.md` file with frontmatter and system prompt
- `README.md` explaining what it does, how to use it, and example prompts
- At least 2 test cases (`.mtc` solution files in `tests/`)

---

## Building an MCP Plugin

### Architecture

An MCP plugin is a standalone process that communicates with mtc via
JSON-RPC over stdin/stdout. The plugin implements these methods:

- `initialize` — Return capabilities
- `tools/list` — List available tools
- `tools/call` — Execute a tool

### Scaffold (TypeScript)

```typescript
// server.ts — MCP plugin entry point
import { parse, stringify } from "json-rpc-protocol";

type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const tools: Record<string, { def: ToolDefinition; handler: ToolHandler }> = {};

function register(def: ToolDefinition, handler: ToolHandler): void {
  tools[def.name] = { def, handler };
}

// Register your tools here
register(
  {
    name: "my_tool",
    description: "What this tool does",
    parameters: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input parameter" },
      },
      required: ["input"],
    },
  },
  async (args) => {
    // Implement your tool logic here
    const result = await doSomething(args.input as string);
    return { result };
  },
);

// JSON-RPC over stdin/stdout
process.stdin.on("data", async (buffer) => {
  for (const line of buffer.toString().split("\n").filter(Boolean)) {
    try {
      const req = JSON.parse(line);
      if (req.method === "initialize") {
        console.log(JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
          },
        }));
      } else if (req.method === "tools/list") {
        console.log(JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: { tools: Object.values(tools).map((t) => t.def) },
        }));
      } else if (req.method === "tools/call") {
        const tool = tools[req.params.name as string];
        if (!tool) {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32601, message: `Tool not found: ${req.params.name}` },
          }));
          return;
        }
        const result = await tool.handler(req.params.arguments as Record<string, unknown>);
        console.log(JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: { content: [{ type: "text", text: JSON.stringify(result) }] },
        }));
      }
    } catch {
      // ignore parse errors
    }
  }
});
```

### Registering with mtc

Add to `.mtc/mcp.json`:

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

Tools from MCP plugins are automatically registered and available via `/call`.

### Submission Requirements

- MCP server entry point (JavaScript/TypeScript/Python/etc.)
- `README.md` with setup instructions and usage examples
- `.mtc/mcp.json` snippet for registration
- At least 2 test cases demonstrating tool calls

---

## Judging Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Usefulness** | 30% | Does it solve a real problem? Would you use it daily? |
| **Quality** | 25% | Error handling, edge cases, documentation |
| **Creativity** | 20% | Novel approach or unique capability |
| **Integration** | 15% | How well does it compose with existing mtc features? |
| **Presentation** | 10% | Clear demo, good README, example prompts |

---

## Prizes

| Place | Prize |
|-------|-------|
| 1st | Project becomes an official mtc plugin, team swag |
| 2nd | Team lunch |
| 3rd | Recognition in the monthly engineering newsletter |

All submitted projects will be published to the team's internal plugin registry
for everyone to use.

---

## Resources

- [MTC Playbook](./playbook.md) — Prompt engineering, agent usage patterns
- [Custom Agents](../src/agents/custom.ts) — Agent loading logic
- [MCP Client](../src/mcp/client.ts) — MCP JSON-RPC implementation
- [MCP Config](../src/mcp/config.ts) — MCP server configuration
- [MCP Integrations](./internal/mcp-integrations.md) — Plugin development and registration
- [Multi-Department Workflows](./internal/multi-department-workflows.md) — Bundled bridge examples (Figma, DevOps)
