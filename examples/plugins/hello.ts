// Example MetaTeam plugin — drop a copy into `.mtc/plugins/` or
// `~/.config/mtc/plugins/` to load it. Enabled via `mtc plugin list|reload`.
import type { Plugin } from "../../src/plugins";

const hello: Plugin = {
  name: "hello-mtc",
  version: "1.0.0",
  description: "Example plugin that adds a trivial echo tool.",
  hooks: {
    beforeTool: (name) => {
      console.log(`[hello-mtc] about to run tool '${name}'`);
    },
  },
  tools: [
    {
      name: "echo_text",
      description: "Returns its input unchanged. Demonstrates a plugin-registered tool.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to echo" },
        },
        required: ["text"],
        additionalProperties: false,
      },
      async execute(args: Record<string, unknown>) {
        return { success: true, output: String(args.text ?? "") };
      },
    },
  ] as any,
};

export { hello as plugin };