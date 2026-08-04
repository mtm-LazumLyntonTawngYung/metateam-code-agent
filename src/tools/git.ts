import { z } from "zod";
import { execFileSync } from "child_process";
import type { ToolDefinition } from "./schema";

function runGit(args: string[], cwd?: string): { ok: boolean; out: string; err?: string } {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return { ok: true, out };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      out: err.stdout ?? "",
      err: (err.stderr ?? err.message ?? "").trim(),
    };
  }
}

export function gitDiff(path?: string, cwd?: string): { ok: boolean; out: string; err?: string } {
  const args = ["diff", "--no-color"];
  if (path) args.push("--", path);
  return runGit(args, cwd);
}

export function gitStatus(cwd?: string): { ok: boolean; out: string; err?: string } {
  return runGit(["status", "--short", "--branch"], cwd);
}

export function gitCommit(message: string, files: string[] | undefined, cwd?: string): {
  ok: boolean;
  out: string;
  err?: string;
} {
  const addRes = runGit([...["add", "--"], ...(files && files.length > 0 ? files : ["-A"])], cwd);
  if (!addRes.ok) return addRes;
  const commitRes = runGit(["commit", "-m", message], cwd);
  return commitRes;
}

const GitDiffSchema = z.object({
  path: z.string().optional().describe("Optional path to scope the diff to."),
  status: z.boolean().optional().describe("Include porcelain status line (default: include)."),
});

const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  description:
    "Show the working-tree diff and current git status. Use to inspect uncommitted changes before committing.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Optional path to scope the diff to." },
      status: { type: "boolean", description: "Include porcelain status (default: include)." },
    },
  },
  schema: GitDiffSchema,
  execute(args) {
    const parsed = GitDiffSchema.parse(args);
    const status = parsed.status ?? true;
    const statusRes = status ? gitStatus() : { ok: true, out: "" };
    const diffRes = gitDiff(parsed.path);
    const combined = [statusRes.out.trim(), diffRes.out.trim()].filter(Boolean).join("\n");
    return combined
      ? { success: true, data: { diff: combined } }
      : { success: true, data: { diff: "(no changes in working tree)" } };
  },
};

const GitCommitSchema = z.object({
  message: z.string().describe("Commit message."),
  files: z.array(z.string()).optional().describe("Specific files to stage (default: all tracked changes)."),
});

const gitCommitTool: ToolDefinition = {
  name: "git_commit",
  description:
    "Stage and commit the current working-tree changes with a message. Use git_diff first to confirm what will be committed.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Commit message." },
      files: { type: "object", description: "Optional file list to stage." },
    },
    required: ["message"],
  },
  schema: GitCommitSchema,
  execute(args) {
    const parsed = GitCommitSchema.parse(args);
    const res = gitCommit(parsed.message, parsed.files);
    if (!res.ok) {
      return { success: false, error: res.err || "git commit failed", data: { out: res.out } };
    }
    return { success: true, data: { output: res.out.trim() } };
  },
};

export { gitDiffTool, gitCommitTool };