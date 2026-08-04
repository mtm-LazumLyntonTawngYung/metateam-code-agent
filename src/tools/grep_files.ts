import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";
import { isPathIgnored } from "../secrets/index";
import type { ToolDefinition } from "./schema";

const GrepSchema = z.object({
  pattern: z.string().describe("Regex pattern to search for"),
  path: z.string().optional().describe("Root directory to search in (defaults to cwd)"),
  glob: z.string().optional().describe("Optional glob filter, e.g. **/*.ts"),
  case_sensitive: z.boolean().optional().describe("Case-sensitive search (default: false)"),
  max_results: z.number().int().positive().max(200).optional().describe("Maximum matches to return (default: 50, max: 200)"),
});

const DEFAULT_EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage",
  ".next", ".nuxt", ".cache", ".turbo", ".venv", "venv",
  "__pycache__", ".idea", ".vscode", "vendor",
]);

const grepFilesTool: ToolDefinition = {
  name: "grep_files",
  description:
    "Search file contents using a regex pattern. Returns matching file paths with line numbers and snippets.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regex pattern to search for",
      },
      path: {
        type: "string",
        description: "Root directory to search in (defaults to cwd)",
      },
      glob: {
        type: "string",
        description: "Optional glob filter, e.g. **/*.ts",
      },
      case_sensitive: {
        type: "boolean",
        description: "Case-sensitive search (default: false)",
      },
      max_results: {
        type: "number",
        description: "Maximum matches to return (default: 50, max: 200)",
      },
    },
    required: ["pattern"],
  },
  schema: GrepSchema,
  execute(args) {
    const parsed = GrepSchema.parse(args);
    const pattern = parsed.pattern;
    const root = resolve(parsed.path ?? process.cwd());
    const glob = parsed.glob;
    const caseSensitive = parsed.case_sensitive ?? false;
    const maxResults = Math.min(parsed.max_results ?? 50, 200);

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
    } catch {
      return { success: false, error: `Invalid regex pattern: ${pattern}` };
    }

    const matches: Array<{ file: string; line: number; text: string }> = [];
    const files = collectFiles(root, glob);

    for (const file of files) {
      if (matches.length >= maxResults) break;
      try {
        const content = readFileSync(file, "utf-8");
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
          if (regex.test(lines[i])) {
            matches.push({
              file: relative(root, file),
              line: i + 1,
              text: lines[i].trim(),
            });
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    return {
      success: true,
      data: { matches, count: matches.length, pattern, root },
    };
  },
};

function collectFiles(root: string, glob?: string): string[] {
  const results: string[] = [];
  const maxDepth = 20;

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = resolve(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (isPathIgnored(full) || isDefaultExcluded(entry)) continue;
          walk(full, depth + 1);
        } else if (stat.isFile()) {
          if (glob && !matchesGlob(entry, full, glob)) continue;
          results.push(full);
        }
      } catch {
        // skip
      }
    }
  }

  walk(root, 0);
  return results;
}

function isDefaultExcluded(name: string): boolean {
  return DEFAULT_EXCLUDED_DIRS.has(name);
}

function matchesGlob(entry: string, fullPath: string, pattern: string): boolean {
  if (pattern === entry) return true;
  const regexStr = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  try {
    const re = new RegExp(`^${regexStr}$`);
    return re.test(entry) || re.test(fullPath);
  } catch {
    return false;
  }
}

export default grepFilesTool;
