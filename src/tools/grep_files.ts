import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";
import { spawnSync } from "child_process";
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

    const rg = ripgrepMatches(pattern, root, glob, caseSensitive, maxResults);
    if (rg.used) {
      return {
        success: true,
        data: { matches: rg.matches, count: rg.matches.length, pattern, root, engine: "ripgrep" },
      };
    }

    const matches: Array<GrepMatch> = [];
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
      data: { matches, count: matches.length, pattern, root, engine: "builtin" },
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

type GrepMatch = { file: string; line: number; text: string };

function ripgrepMatches(
  pattern: string,
  root: string,
  glob: string | undefined,
  caseSensitive: boolean,
  maxResults: number,
): { matches: GrepMatch[]; used: boolean } {
  const args = [
    "--line-number",
    "--no-heading",
    "--with-filename",
    "--max-count", "1",
    ...(caseSensitive ? ["--case-sensitive"] : ["--ignore-case"]),
    ...(glob ? ["--glob", glob] : []),
    "--max-count", String(maxResults),
    "--",
    pattern,
    ".",
  ];
  const res = spawnSync("rg", args, {
    cwd: root,
    encoding: "utf-8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error || res.status === 127 || res.status === 2 && /not found/i.test(res.stderr ?? "")) {
    return { matches: [], used: false };
  }
  const matches: GrepMatch[] = [];
  const out = res.stdout ?? "";
  for (const line of out.split(/\r?\n/)) {
    if (!line) continue;
    const idx1 = line.indexOf(":");
    if (idx1 === -1) continue;
    const file = line.slice(0, idx1);
    const rest = line.slice(idx1 + 1);
    const idx2 = rest.indexOf(":");
    if (idx2 === -1) continue;
    const lineno = Number(rest.slice(0, idx2));
    const text = rest.slice(idx2 + 1).trim();
    matches.push({ file, line: Number.isFinite(lineno) ? lineno : 0, text });
    if (matches.length >= maxResults) break;
  }
  return { matches, used: true };
}

export default grepFilesTool;
