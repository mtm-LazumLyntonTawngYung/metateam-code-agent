import { accessSync, constants, readFileSync, writeFileSync } from "fs";
import type { ToolDefinition } from "./schema";

const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Search-and-replace text within a file. Replaces ALL occurrences of targetString with replacement. Reports how many replacements were made.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path to the file to edit",
      },
      targetString: {
        type: "string",
        description: "The exact text to search for. Must match a unique portion of the file.",
      },
      replacement: {
        type: "string",
        description: "The text to replace targetString with",
      },
    },
    required: ["path", "targetString", "replacement"],
  },
  execute(args) {
    const path = args.path as string;
    const target = args.targetString as string;
    const replacement = args.replacement as string;

    try {
      accessSync(path, constants.R_OK | constants.W_OK);
    } catch {
      return { success: false, error: `File not found or not writable: ${path}` };
    }

    const original = readFileSync(path, "utf-8");

    if (!original.includes(target)) {
      return {
        success: false,
        error: `targetString not found in file: ${JSON.stringify(target.slice(0, 80))}`,
      };
    }

    const count = (original.match(new RegExp(escapeRegex(target), "g")) ?? []).length;
    const updated = original.replaceAll(target, replacement);

    try {
      writeFileSync(path, updated, "utf-8");
      return {
        success: true,
        data: { replacedCount: count, path },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to write updated file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default editFileTool;
