import { z } from "zod";
import { Glob } from "bun";
import { resolve, relative } from "path";
import { isPathIgnored } from "../secrets/index";
import type { ToolDefinition } from "./schema";

const DEFAULT_EXCLUDED_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
  "vendor",
];

function isDefaultExcluded(filePath: string): boolean {
  const segments = filePath.replace(/\\/g, "/").split("/");
  return DEFAULT_EXCLUDED_DIRS.some((dir) => segments.includes(dir));
}

const GlobFilesSchema = z.object({
  pattern: z.string().describe("Glob pattern to match (e.g. **/*.ts, src/**/*.js)"),
  path: z.string().optional().describe("Root directory to search in (defaults to cwd)"),
});

const globFilesTool: ToolDefinition = {
  name: "glob_files",
  description:
    "Fast glob search using Bun's native glob. Returns matching file paths. Common dependency and build directories (node_modules, .git, dist, build, etc.) are excluded automatically.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match (e.g. **/*.ts, src/**/*.js)",
      },
      path: {
        type: "string",
        description: "Root directory to search in (defaults to cwd)",
      },
    },
    required: ["pattern"],
  },
  schema: GlobFilesSchema,
  execute(args) {
    const parsed = GlobFilesSchema.parse(args);
    const pattern = parsed.pattern;
    const root = resolve(parsed.path ?? process.cwd());

    const glob = new Glob(pattern);
    const allFiles = Array.from(glob.scanSync({ cwd: root, absolute: true }));
    const files = allFiles.filter((f) => !isPathIgnored(f) && !isDefaultExcluded(f));
    const count = files.length;

    return {
      success: true,
      data: { files, count, root },
    };
  },
};

export default globFilesTool;
