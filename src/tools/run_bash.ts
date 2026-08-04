import { z } from "zod";
import { spawn } from "child_process";
import { redactText } from "../secrets/index";
import type { ToolDefinition } from "./schema";

const RunBashSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  timeout: z.number().int().positive().max(120000).optional().describe("Optional timeout in milliseconds (default: 30000, max: 120000)"),
  workdir: z.string().optional().describe("Optional working directory (defaults to current project root)"),
});

const runBashTool: ToolDefinition = {
  name: "run_bash",
  description:
    "Execute a terminal command using the system shell. Returns stdout, stderr, and exit code.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      timeout: {
        type: "number",
        description:
          "Optional timeout in milliseconds (default: 30000, max: 120000)",
        default: 30000,
      },
      workdir: {
        type: "string",
        description: "Optional working directory (defaults to current project root)",
      },
    },
    required: ["command"],
  },
  schema: RunBashSchema,
  execute(args) {
    const parsed = RunBashSchema.parse(args);
    const command = parsed.command;
    const timeout = Math.min(parsed.timeout ?? 30000, 120000);
    const workdir = parsed.workdir;

    const isWin = process.platform === "win32";
    const shellCmd = isWin
      ? [process.env.COMSPEC || "cmd.exe", "/c"]
      : ["bash", "-c"];

    return new Promise((resolve) => {
      const safeEnv = sanitizeEnv(process.env);
      const proc = spawn(shellCmd[0], [...shellCmd.slice(1), command], {
        cwd: workdir || process.cwd(),
        env: safeEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({
          success: false,
          error: `Command timed out after ${timeout}ms`,
          data: {
            stdout: redactText(stdoutBuf),
            stderr: redactText(stderrBuf),
            exitCode: null,
            timedOut: true,
          },
        });
      }, timeout);

      let stdoutBuf = "";
      let stderrBuf = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
      });

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          success: exitCode === 0,
          data: {
            stdout: redactText(stdoutBuf),
            stderr: redactText(stderrBuf),
            exitCode,
            timedOut: false,
          },
          error:
            exitCode !== 0 ? `Exit code ${exitCode}` : undefined,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: `Failed to spawn process: ${err.message}`,
          data: {
            stdout: redactText(stdoutBuf),
            stderr: redactText(stderrBuf),
            exitCode: null,
            timedOut: false,
          },
        });
      });
    });
  },
};

function sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const allowed = new Set([
    "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "LC_CTYPE",
    "NODE_ENV", "BUN_INSTALL", "BUN_INSTALL_CACHE",
  ]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (allowed.has(k) || k.startsWith("MTC_") || k.startsWith("MT_")) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

export default runBashTool;
