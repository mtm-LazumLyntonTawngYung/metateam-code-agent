import { render, renderToString } from "ink";
import { Command } from "commander";
import App from "./ui/App";
import { listTasks, runTask } from "./eval/index";

const program = new Command();

program
  .name("mtc")
  .description("Metateam Code Agent — AI-powered terminal-first coding assistant")
  .version("1.0.0")
  .action(async () => {
    if (process.stdin.isTTY) {
      const { waitUntilExit } = render(<App />);
      await waitUntilExit();
    } else {
      const output = renderToString(<App />, { columns: 80 });
      console.log(output);
    }
  });

const evalCmd = program.command("eval").description("Run evaluation tasks");

evalCmd
  .command("list")
  .description("List available eval tasks")
  .action(() => {
    const tasks = listTasks();
    if (tasks.length === 0) {
      console.log("No eval tasks found in tests/evals/");
      return;
    }
    console.log("Available evals:\n");
    for (const t of tasks) {
      console.log(`  ${t.name.padEnd(30)} ${t.title}`);
    }
  });

evalCmd
  .command("run")
  .description("Run an eval task")
  .argument("<name>", "Task name (directory under tests/evals/)")
  .option("-s, --solution <path>", "Path to solution file")
  .action(async (name: string, options: { solution?: string }) => {
    console.log(`Running eval: ${name}...\n`);
    const result = await runTask(name, options.solution);
    if (!result) {
      console.error(`Eval task not found: ${name}`);
      console.error("Use `mtc eval list` to see available tasks.");
      process.exit(1);
    }

    console.log(`Task:     ${result.task}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Calls:    ${result.toolCalls} tools`);
    console.log(`Result:   ${result.passed ? "PASS" : "FAIL"}`);
    if (result.error) console.log(`Error:    ${result.error}`);

    if (result.steps.length > 0) {
      console.log("\nSteps:");
      for (const s of result.steps) {
        const status = s.result.success ? "\u2713" : "\u2717";
        console.log(`  ${status} ${s.toolName} (${s.duration}ms)`);
        if (!s.result.success) {
          console.log(`    Error: ${s.result.error ?? "unknown"}`);
        }
      }
    }

    process.exit(result.passed ? 0 : 1);
  });

program.parse(process.argv);
