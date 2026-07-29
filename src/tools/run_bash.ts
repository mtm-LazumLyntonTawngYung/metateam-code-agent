import { spawn } from "child_process";
import { redactText } from "../secrets/index";
import type { ToolDefinition } from "./schema";

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
  execute(args) {
    const command = args.command as string;
    const timeout = Math.min(
      (args.timeout as number | undefined) ?? 30000,
      120000,
    );
    const workdir = args.workdir as string | undefined;

    const isWin = process.platform === "win32";
    const shellCmd = isWin
      ? [process.env.COMSPEC || "cmd.exe", "/c"]
      : ["bash", "-c"];

    return new Promise((resolve) => {
      const proc = spawn(shellCmd[0], [...shellCmd.slice(1), command], {
        cwd: workdir || process.cwd(),
        env: { ...process.env },
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

export default runBashTool;
