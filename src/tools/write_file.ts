import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve, normalize } from "path";
import type { ToolDefinition } from "./schema";

const BLOCKED_PATHS = [
  /[/\\]etc[/\\]((shadow|passwd|sudoers|hosts|hostname|resolv\.conf)(\b|$))/i,
  /[/\\]windows[/\\]system32[/\\]/i,
  /[/\\]\.ssh[/\\]/,
  /[/\\]\.gnupg[/\\]/,
  /[/\\]\.aws[/\\]credentials/i,
  /[/\\]\.config[/\\]mtc[/\\]/i,
  /[/\\]\.git[/\\]config/i,
];

function isPathBlocked(absolutePath: string): string | null {
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(absolutePath)) {
      return `Writing to this location is blocked for security: ${absolutePath}`;
    }
  }
  return null;
}

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
  execute(args) {
    const path = resolve(normalize(args.path as string));
    const content = args.content as string;

    const blocked = isPathBlocked(path);
    if (blocked) {
      return { success: false, error: blocked };
    }

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
