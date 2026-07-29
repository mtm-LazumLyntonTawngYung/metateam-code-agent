import { Glob } from "bun";
import { resolve } from "path";
import type { ToolDefinition } from "./schema";

const globFilesTool: ToolDefinition = {
  name: "glob_files",
  description: "Search the project tree for files matching a glob pattern. Uses Bun's fast native globber.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description:
          "Glob pattern (e.g. '**/*.ts', 'src/**/*.tsx', '*.json'). Supports *, **, ?.",
      },
      path: {
        type: "string",
        description: "Root directory to search from (defaults to current working directory)",
      },
    },
    required: ["pattern"],
  },
  async execute(args) {
    const pattern = args.pattern as string;
    const root = resolve(args.path as string || process.cwd());

    try {
      const glob = new Glob(pattern);
      const files: string[] = [];
      for await (const entry of glob.scan({ cwd: root, absolute: true })) {
        files.push(entry);
      }
      files.sort();
      return {
        success: true,
        data: { files, count: files.length, root },
      };
    } catch (err) {
      return {
        success: false,
        error: `Glob failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

export default globFilesTool;
