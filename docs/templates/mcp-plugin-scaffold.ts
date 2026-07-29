/**
 * MCP Plugin Scaffold
 *
 * A minimal MCP server that mtc can connect to.
 * Copy this file, rename, and implement your tool handlers.
 *
 * Usage:
 *   1. Implement register() calls below
 *   2. Add to .mtc/mcp.json:
 *      {
 *        "mcpServers": {
 *          "my-plugin": {
 *            "command": "bun",
 *            "args": ["run", "path/to/this-file.ts"]
 *          }
 *        }
 *      }
 *   3. Restart mtc — tools appear under /call
 */

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const tools = new Map<string, { def: ToolDef; handler: Handler }>();

function register(def: ToolDef, handler: Handler): void {
  tools.set(def.name, { def, handler });
}

// ─── Register your tools here ────────────────────────────────────────
//
// register(
//   {
//     name: "hello",
//     description: "Say hello to someone",
//     parameters: {
//       type: "object",
//       properties: {
//         name: { type: "string", description: "Name to greet" },
//       },
//       required: ["name"],
//     },
//   },
//   async (args) => {
//     return { greeting: `Hello, ${args.name}!` };
//   },
// );

// ─── JSON-RPC loop ──────────────────────────────────────────────────

const pending = new Map<string, (val: unknown) => void>();

process.stdin.on("data", (buffer: Buffer) => {
  for (const line of buffer.toString().split("\n").filter(Boolean)) {
    try {
      const req = JSON.parse(line);
      handleRequest(req);
    } catch {
      // skip malformed
    }
  }
});

async function handleRequest(req: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: unknown;
}): Promise<void> {
  const respond = (result: unknown) =>
    write({ jsonrpc: "2.0", id: req.id, result });

  const respondError = (code: number, message: string) =>
    write({ jsonrpc: "2.0", id: req.id, error: { code, message } });

  switch (req.method) {
    case "initialize":
      return respond({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
      });

    case "tools/list":
      return respond({ tools: [...tools.values()].map((t) => t.def) });

    case "tools/call": {
      const p = req.params as { name: string; arguments?: Record<string, unknown> };
      const tool = tools.get(p.name);
      if (!tool) return respondError(-32601, `Tool not found: ${p.name}`);
      try {
        const result = await tool.handler(p.arguments ?? {});
        return respond({ content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (err) {
        return respondError(-32603, err instanceof Error ? err.message : String(err));
      }
    }

    default:
      return respondError(-32601, `Method not found: ${req.method}`);
  }
}

function write(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
