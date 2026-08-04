import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, normalize, resolve } from "path";
import type { ToolDefinition } from "./schema";
import { isPathBlocked } from "./write_file";
import { recordPatch } from "../session/patches";

const ApplyPatchSchema = z.object({
  patch: z
    .string()
    .describe(
      "A unified diff (git-style) that adds, removes, or modifies lines in one or more files. " +
        'Example blocks: "--- a/foo.ts\\n+++ b/foo.ts\\n@@ -1,3 +1,4 @@\\n old line\\n-new line\\n+added line\\n context".',
    ),
});

type Hunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  body: string[];
};

type FileBlock = {
  oldFile: string;
  newFile: string;
  hunks: Hunk[];
};

function parseHeader(header: string): Pick<Hunk, "oldStart" | "oldCount" | "newStart" | "newCount"> {
  const m = header.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!m) {
    return { oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 };
  }
  return {
    oldStart: Number(m[1]),
    oldCount: m[2] ? Number(m[2]) : 1,
    newStart: Number(m[3]),
    newCount: m[4] ? Number(m[4]) : 1,
  };
}

export function parsePatch(patch: string): FileBlock[] {
  const blocks: FileBlock[] = [];
  let current: FileBlock | null = null;
  const lines = patch.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith("--- ")) {
      current = { oldFile: line.slice(4).trim(), newFile: "", hunks: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++ ")) {
      current.newFile = line.slice(4).trim();
      continue;
    }
    if (line.startsWith("@@")) {
      const range = parseHeader(line);
      current.hunks.push({
        ...range,
        header: line,
        body: [],
      });
      continue;
    }
    if (current.hunks.length > 0) {
      current.hunks[current.hunks.length - 1].body.push(line);
    }
  }

  return blocks;
}

function cleanPath(raw: string): string {
  if (raw === "/dev/null" || raw === '"dev/null"') return raw;
  const trimmed = raw.trim().replace(/^"|"$/g, "");
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) return trimmed.slice(2);
  return trimmed;
}

function matchAt(lines: string[], pos: number, body: string[]): boolean {
  let p = pos;
  for (const b of body) {
    if (b.startsWith("+") || b.startsWith("\\")) continue;
    if (lines[p] === undefined) return false;
    const prefix = b.startsWith(" ") ? " " : "-";
    if (lines[p] !== b.slice(prefix.length)) return false;
    p++;
  }
  return true;
}

function findMatch(lines: string[], body: string[], hint: number): number {
  const lo = Math.max(0, hint - 400);
  const hi = Math.min(lines.length, hint + 400);
  for (let p = lo; p <= hi; p++) {
    if (matchAt(lines, p, body)) return p;
  }
  for (let p = 0; p < lines.length; p++) {
    if (matchAt(lines, p, body)) return p;
  }
  return -1;
}

export type ApplyHunkResult = {
  ok: boolean;
  lines?: string[];
  error?: string;
};

export function applyHunk(lines: string[], hunk: Hunk): ApplyHunkResult {
  let pos = hunk.oldStart - 1;
  if (pos < 0) pos = 0;
  if (pos > lines.length) pos = lines.length;

  if (!matchAt(lines, pos, hunk.body)) {
    const found = findMatch(lines, hunk.body, pos);
    if (found < 0) {
      return { ok: false, error: `Hunk context not found (line ${hunk.oldStart}). ${hunk.header}` };
    }
    pos = found;
  }

  const newLines: string[] = [];
  let oldPos = pos;
  let added = 0;
  let removed = 0;

  for (const b of hunk.body) {
    if (b.startsWith("-")) {
      if (lines[oldPos] !== undefined && lines[oldPos] !== b.slice(1)) {
        return {
          ok: false,
          error: `Removal mismatch at line ${oldPos + 1}. Expected "${b.slice(1)}", found "${lines[oldPos]}".`,
        };
      }
      oldPos++;
      removed++;
    } else if (b.startsWith("+")) {
      newLines.push(b.slice(1));
      added++;
    } else if (b.startsWith(" ")) {
      if (lines[oldPos] === undefined || lines[oldPos] !== b.slice(1)) {
        return {
          ok: false,
          error: `Context mismatch at line ${oldPos + 1}. Expected "${b.slice(1)}", found "${lines[oldPos]}".`,
        };
      }
      newLines.push(b.slice(1));
      oldPos++;
    }
  }

  void added;
  void removed;

  return {
    ok: true,
    lines: [...lines.slice(0, pos), ...newLines, ...lines.slice(oldPos)],
  };
}

export function applyPatchText(patch: string, readFile: (path: string) => string): {
  blocks: Array<{
    file: string;
    ok: boolean;
    output?: string;
    created?: boolean;
    error?: string;
  }>;
} {
  const blocks = parsePatch(patch);
  const results = blocks.map((block) => {
    const target = cleanPath(block.newFile === "/dev/null" ? block.oldFile : block.newFile);
    if (block.hunks.length === 0) {
      return { file: target, ok: false, error: "No hunks in this diff block." };
    }
    const original = readFile(target);
    let lines = original ? original.replace(/\r\n/g, "\n").split("\n") : [];
    let ok = true;
    let error: string | undefined;
    for (const hunk of block.hunks) {
      const res = applyHunk(lines, hunk);
      if (!res.ok) {
        ok = false;
        error = res.error;
        break;
      }
      lines = res.lines!;
    }
    if (!ok) return { file: target, ok: false, error };
    return { file: target, ok: true, output: lines.join("\n"), created: !original };
  });
  return { blocks: results };
}

const applyPatchTool: ToolDefinition = {
  name: "apply_patch",
  description:
    "Apply a unified diff (git patch) to the workspace. Preferred over edit_file when a change touches many lines " +
    "or spans multiple files, or when exact-string matching is unreliable. The patch is matched with whitespace tolerance.",
  parameters: {
    type: "object",
    properties: {
      patch: {
        type: "string",
        description: "Unified diff text. One or more `---`/`+++` file blocks with `@@` hunks.",
      },
    },
    required: ["patch"],
  },
  schema: ApplyPatchSchema,
  execute(args) {
    const parsed = ApplyPatchSchema.parse(args);

    const readFileFor = (raw: string): string => {
      const target = cleanPath(raw);
      if (target === "/dev/null") return "";
      const absPath = resolve(normalize(target));
      try {
        return existsSync(absPath) ? readFileSync(absPath, "utf-8") : "";
      } catch {
        return "";
      }
    };

    const { blocks } = applyPatchText(parsed.patch, readFileFor);
    const files: Array<Record<string, unknown>> = [];
    let wroteAny = false;

    for (const b of blocks) {
      const entry: Record<string, unknown> = {
        file: b.file,
        ok: b.ok,
        created: b.created ?? false,
        ...(b.error ? { error: b.error } : {}),
      };
      if (!b.ok || b.output === undefined) {
        files.push(entry);
        continue;
      }
      const absPath = resolve(normalize(b.file));
      const blocked = isPathBlocked(absPath);
      if (blocked) {
        entry.ok = false;
        entry.error = blocked;
        files.push(entry);
        continue;
      }
      const original = readFileFor(b.file);
      try {
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, b.output, "utf-8");
        recordPatch(b.file, original, b.output, "apply_patch", { patch: parsed.patch.slice(0, 400) });
        entry.file = b.file;
        wroteAny = true;
      } catch (err) {
        entry.ok = false;
        entry.error = `Failed to write: ${err instanceof Error ? err.message : String(err)}`;
      }
      files.push(entry);
    }

    return {
      success: blocks.every((b) => b.ok) && wroteAny,
      data: { files },
      ...(blocks.every((b) => b.ok) ? {} : { error: "One or more hunks could not be applied." }),
    };
  },
};

export default applyPatchTool;