import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve, normalize } from "path";
import type { ToolDefinition } from "./schema";

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
