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
      return {
        success: false,
        error:
          `targetString was not found in ${path}. It may differ in whitespace/indentation or the file may have changed. ` +
          `Read the file to confirm the exact text, then retry with the correct targetString.`,
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

export default editFileTool;
