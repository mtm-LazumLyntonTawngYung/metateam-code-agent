import { accessSync, constants, readFileSync, statSync } from "fs";
import { isPathIgnored } from "../secrets/index";
import type { ToolDefinition } from "./schema";

const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read file contents with optional line range support. Lines are 1-indexed.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path to the file",
      },
      offset: {
        type: "number",
        description: "Starting line number (1-indexed). Omit to read from the beginning.",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read. Omit to read all lines.",
      },
    },
    required: ["path"],
  },
  execute(args) {
    const path = args.path as string;
    const offset = args.offset as number | undefined;
    const limit = args.limit as number | undefined;

    if (isPathIgnored(path)) {
      return {
        success: false,
        error: `Cannot read '${path}': path matches .mtcignore patterns`,
      };
    }

    try {
      accessSync(path, constants.R_OK);
    } catch {
      return {
        success: false,
        error: `File not found or not readable: ${path}`,
      };
    }

    const stat = statSync(path);
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB.`,
      };
    }

    const raw = readFileSync(path, "utf-8");
    const lines = raw.split("\n");
    const totalLines = lines.length;

    const start = offset ? Math.max(1, offset) : 1;
    const end = limit ? Math.min(start + limit - 1, totalLines) : totalLines;

    const slice = lines.slice(start - 1, end);
    const content = slice
      .map((line, i) => `${String(start + i).padStart(4)} | ${line}`)
      .join("\n");

    return {
      success: true,
      data: { content, totalLines, startLine: start, endLine: end },
    };
  },
};

export default readFileTool;
