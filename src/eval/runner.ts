import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, rmSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { executeTool } from "../tools/index";
import type { EvalTask, EvalStep, EvalResult } from "./types";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = resolve(MODULE_DIR, "..", "..", "tests", "evals");

function parseToolLine(line: string): { tool: string; args: Record<string, unknown> } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1);

  if (cmd === "/read" && rest[0]) {
    return {
      tool: "read_file",
      args: { path: rest[0], offset: rest[1] ? Number(rest[1]) : undefined, limit: rest[2] ? Number(rest[2]) : undefined },
    };
  }
  if (cmd === "/write" && rest[0]) {
    return { tool: "write_file", args: { path: rest[0], content: rest.slice(1).join(" ") } };
  }
  if (cmd === "/edit" && rest[0] && rest[1]) {
    return {
      tool: "edit_file",
      args: { path: rest[0], targetString: rest[1], replacement: rest.slice(2).join(" ") },
    };
  }
  if (cmd === "/bash") {
    return { tool: "run_bash", args: { command: rest.join(" ") } };
  }
  if (cmd === "/glob" && rest[0]) {
    return { tool: "glob_files", args: { pattern: rest[0], path: rest[1] || undefined } };
  }
  if (cmd === "/call" && rest[0]) {
    const toolName = rest[0];
    let args: Record<string, unknown>;
    try {
      args = rest.slice(1).length ? JSON.parse(rest.slice(1).join(" ")) : {};
    } catch {
      args = { input: rest.slice(1).join(" ") };
    }
    return { tool: toolName, args };
  }
  return null;
}

function loadSolution(path: string): string[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"));
}

function findEvals(): EvalTask[] {
  if (!existsSync(EVALS_DIR)) return [];
  const tasks: EvalTask[] = [];
  for (const entry of readdirSync(EVALS_DIR)) {
    const dir = join(EVALS_DIR, entry);
    if (statSync(dir).isDirectory() && existsSync(join(dir, "task.md"))) {
      const content = readFileSync(join(dir, "task.md"), "utf-8");
      const title = content.split("\n")[0]?.replace(/^#\s*/, "").trim() || entry;
      tasks.push({ name: entry, title, dir });
    }
  }
  return tasks;
}

export function listTasks(): EvalTask[] {
  return findEvals();
}

function hasBash(): boolean {
  try {
    return spawnSync("bash", ["--version"], { stdio: "pipe", encoding: "utf-8" }).status === 0;
  } catch {
    return false;
  }
}

function copyRecursive(src: string, dest: string): void {
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyRecursive(s, d);
    } else {
      mkdirSync(dirname(d), { recursive: true });
      writeFileSync(d, readFileSync(s));
    }
  }
}

function createSandbox(dir: string): string {
  const sandboxDir = join(tmpdir(), "mtc-eval", randomUUID());
  mkdirSync(sandboxDir, { recursive: true });

  const sandboxSrc = join(dir, "sandbox");
  if (existsSync(sandboxSrc)) {
    copyRecursive(sandboxSrc, sandboxDir);
  }

  const setupPath = join(dir, "setup.sh");
  if (existsSync(setupPath) && hasBash()) {
    spawnSync("bash", [setupPath, sandboxDir], { stdio: "pipe", encoding: "utf-8" });
  }

  return sandboxDir;
}

function runAssert(dir: string, sandboxDir: string): boolean {
  const assertPath = join(dir, "assert.sh");
  if (!existsSync(assertPath)) return true;

  if (hasBash()) {
    return spawnSync("bash", [assertPath, sandboxDir], { stdio: "pipe", encoding: "utf-8" }).status === 0;
  }

  for (const name of ["assert.cjs", "assert.mjs", "assert.js"]) {
    const jsPath = join(dir, name);
    if (existsSync(jsPath)) {
      return spawnSync("node", [jsPath, sandboxDir], { stdio: "pipe", encoding: "utf-8" }).status === 0;
    }
  }

  return true;
}

export async function runTask(taskName: string, solutionPath?: string): Promise<EvalResult | null> {
  const tasks = findEvals();
  const task = tasks.find((t) => t.name === taskName);
  if (!task) return null;

  let lines: string[];
  if (solutionPath) {
    lines = loadSolution(resolve(process.cwd(), solutionPath));
  } else {
    const solPath = join(task.dir, "solution.mtc");
    if (existsSync(solPath)) {
      lines = loadSolution(solPath);
    } else {
      return { task: taskName, passed: false, duration: 0, toolCalls: 0, steps: [], error: "No solution.mtc or --solution" };
    }
  }

  const sandboxDir = createSandbox(task.dir);
  const start = Date.now();
  const steps: EvalStep[] = [];

  for (const line of lines) {
    const parsed = parseToolLine(line);
    if (!parsed) continue;

    const { tool, args } = parsed;

    if (["read_file", "write_file", "edit_file", "glob_files"].includes(tool) && typeof args.path === "string") {
      args.path = join(sandboxDir, args.path);
    }
    if (tool === "run_bash") {
      (args as Record<string, unknown>).workdir = sandboxDir;
    }

    const stepStart = Date.now();
    const result = await executeTool(tool, args);
    steps.push({ toolName: tool, args, result, duration: Date.now() - stepStart });
  }

  const duration = Date.now() - start;
  const passed = runAssert(task.dir, sandboxDir);

  try { rmSync(sandboxDir, { recursive: true, force: true }); } catch { /* ignore */ }

  return { task: taskName, passed, duration, toolCalls: steps.length, steps, error: passed ? undefined : "Assertion failed" };
}
