import { z } from "zod";
import { accessSync, constants, readFileSync, writeFileSync } from "fs";
import { normalize, resolve } from "path";
import type { ToolDefinition } from "./schema";
import { isPathBlocked } from "./write_file";
import { recordPatch } from "../session/patches";

const EditFileSchema = z.object({
  path: z.string().describe("Absolute or relative path to the file to edit"),
  targetString: z.string().describe("The exact text to search for. Must match exactly one location in the file."),
  replacement: z.string().describe("The text to replace targetString with"),
});

const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Replace an exact, unique string in a file. The targetString must match exactly one location, or the edit is rejected and an error explains how to disambiguate. Returns a short before/after summary on success. Nothing is changed unless the match is unique.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path to the file to edit",
      },
      targetString: {
        type: "string",
        description: "The exact text to search for. Must match exactly one location in the file.",
      },
      replacement: {
        type: "string",
        description: "The text to replace targetString with",
      },
    },
    required: ["path", "targetString", "replacement"],
  },
  schema: EditFileSchema,
  execute(args) {
    const parsed = EditFileSchema.parse(args);
    const path = resolve(normalize(parsed.path));
    const target = parsed.targetString;
    const replacement = parsed.replacement;

    const blocked = isPathBlocked(path);
    if (blocked) {
      return { success: false, error: blocked };
    }

    try {
      accessSync(path, constants.R_OK | constants.W_OK);
    } catch {
      return { success: false, error: `File not found or not writable: ${path}` };
    }

    let original: string;
    try {
      original = readFileSync(path, "utf-8");
    } catch (err) {
      return {
        success: false,
        error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (target.length === 0) {
      return { success: false, error: "targetString must not be empty." };
    }

    const first = original.indexOf(target);

    if (first === -1) {
      const fuzzy = fuzzyUniqueReplace(original, target, replacement);
      if (fuzzy.applied) {
        const updated = fuzzy.updated;
        recordPatch(path, original, updated, "edit_file", {
          path,
          targetString: target,
          replacement,
          fuzzy: true,
        });
        try {
          writeFileSync(path, updated, "utf-8");
          return {
            success: true,
            data: {
              path,
              replacedCount: 1,
              before: target.slice(0, 80),
              after: replacement.slice(0, 80),
              fuzzy: true,
            },
          };
        } catch (err) {
          return {
            success: false,
            error: `Failed to write updated file: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
      return {
        success: false,
        error:
          `targetString was not found in ${path}. ${fuzzy.reason} ` +
          `Read the file to confirm the exact text, then retry. ` +
          `Hint: you can also use the apply_patch tool, which matches hunks with more tolerance.`,
      };
    }

    const occurrences = countOccurrences(original, target);
    if (occurrences > 1) {
      const before = original.slice(Math.max(0, first - 80), first);
      const after = original.slice(first + target.length, first + target.length + 80);
      return {
        success: false,
        error:
          `targetString appears ${occurrences} times in ${path}, so the edit is ambiguous. ` +
          `edit_file requires an exact, unique match. Expand targetString to include more surrounding context ` +
          `so it matches exactly one location. Nearby text:\n` +
          `  before: ${JSON.stringify(before)}\n` +
          `  after: ${JSON.stringify(after)}`,
      };
    }

    const updated = original.slice(0, first) + replacement + original.slice(first + target.length);

    recordPatch(path, original, updated, "edit_file", {
      path,
      targetString: target,
      replacement,
    });

    try {
      writeFileSync(path, updated, "utf-8");
      return {
        success: true,
        data: {
          path,
          replacedCount: 1,
          before: target.slice(0, 80),
          after: replacement.slice(0, 80),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to write updated file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let idx = text.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(needle, idx + needle.length);
  }
  return count;
}

function normalizeWhitespace(text: string): { norm: string; spans: number[] } {
  let norm = "";
  const spans: number[] = [];
  let i = 0;
  let pendingWs = false;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      pendingWs = true;
      i++;
      continue;
    }
    if (pendingWs) {
      if (norm.length > 0) {
        norm += " ";
        spans.push(i);
      }
      pendingWs = false;
    }
    norm += ch;
    spans.push(i);
    i++;
  }
  return { norm, spans };
}

export type FuzzyMatchResult =
  | { applied: true; updated: string; fuzzy: true }
  | { applied: false; reason: string };

export function fuzzyUniqueReplace(original: string, target: string, replacement: string): FuzzyMatchResult {
  if (!target || !target.trim()) {
    return { applied: false, reason: "targetString must contain non-whitespace text." };
  }
  const { norm: fileNorm, spans: fSpans } = normalizeWhitespace(original);
  const { norm: targetNorm, spans: tSpans } = normalizeWhitespace(target);
  if (!targetNorm) {
    return { applied: false, reason: "targetString must contain non-whitespace text." };
  }

  const first = fileNorm.indexOf(targetNorm);
  if (first === -1) {
    return { applied: false, reason: "targetString was not found, even ignoring whitespace differences." };
  }

  let count = 0;
  let idx = first;
  while (idx !== -1) {
    count++;
    idx = fileNorm.indexOf(targetNorm, idx + targetNorm.length);
  }
  if (count > 1) {
    return {
      applied: false,
      reason: `targetString appears ${count} times when ignoring whitespace, so the edit is ambiguous. Add more surrounding context.`,
    };
  }

  const realStart = fSpans[first];
  const realEnd = fSpans[first + tSpans.length - 1] + 1;
  const updated = original.slice(0, realStart) + replacement + original.slice(realEnd);
  return { applied: true, updated, fuzzy: true };
}

export default editFileTool;
