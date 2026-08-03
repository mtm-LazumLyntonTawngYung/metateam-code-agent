import { describe, test, expect } from "bun:test";
import { join } from "path";
import { listTasks, runAgentEval, sandboxExecutor } from "../../src/eval/index";

describe("Eval harness", () => {
  test("listTasks discovers the bundled eval tasks", () => {
    const tasks = listTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.map((t) => t.name)).toContain("add-unit-tests");
  });

  test("runAgentEval returns null for an unknown task without invoking the LLM", async () => {
    const result = await runAgentEval("does-not-exist");
    expect(result).toBeNull();
  });

  test("sandboxExecutor rewrites file paths into the sandbox directory", async () => {
    const exec = sandboxExecutor(join("tmp", "sandbox"));
    const args: Record<string, unknown> = { path: "src/utils.js" };
    await exec("read_file", args);
    expect(args.path).toBe(join("tmp", "sandbox", "src", "utils.js"));
  });

  test("sandboxExecutor pins run_bash to the sandbox working directory", async () => {
    const exec = sandboxExecutor(join("tmp", "sandbox"));
    const args: Record<string, unknown> = { command: "pwd" };
    await exec("run_bash", args);
    expect(args.workdir).toBe(join("tmp", "sandbox"));
  });
});
