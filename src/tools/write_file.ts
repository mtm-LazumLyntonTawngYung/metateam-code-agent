import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve, normalize } from "path";
import type { ToolDefinition } from "./schema";
import { recordPatch } from "../session/patches";

const BLOCKED_PATHS = [
  /[/\\]etc[/\\]((shadow|passwd|sudoers|hosts|hostname|resolv\.conf)(\b|$))/i,
  /[/\\]windows[/\\]system32[/\\]/i,
  /[/\\]\.ssh[/\\]/,
  /[/\\]\.gnupg[/\\]/,
  /[/\\]\.aws[/\\]credentials/i,
  /[/\\]\.config[/\\]mtc[/\\]/i,
  /[/\\]\.git[/\\]config/i,
];

export function isPathBlocked(absolutePath: string): string | null {
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(absolutePath)) {
      return `Writing to this location is blocked for security: ${absolutePath}`;
    }
  }
  return null;
}

const WriteFileSchema = z.object({
  path: z.string().describe("Absolute or relative path of the file to write"),
  content: z.string().describe("The full content to write to the file"),
});

const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Create a new file or overwrite an existing file with the given content.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path of the file to write",
      },
      content: {
        type: "string",
        description: "The full content to write to the file",
      },
    },
    required: ["path", "content"],
  },
  schema: WriteFileSchema,
  execute(args) {
    const parsed = WriteFileSchema.parse(args);
    const path = resolve(normalize(parsed.path));
    const content = parsed.content;

    const blocked = isPathBlocked(path);
    if (blocked) {
      return { success: false, error: blocked };
    }

    let originalContent = "";
    try {
      originalContent = readFileSync(path, "utf-8");
    } catch {
      // file is new; originalContent stays empty
    }

    recordPatch(path, originalContent, content, "write_file", {
      path,
      bytes: Buffer.byteLength(content, "utf-8"),
    });

    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf-8");
      return {
        success: true,
        data: { path, bytesWritten: Buffer.byteLength(content, "utf-8") },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

export default writeFileTool;
