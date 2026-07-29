import { render, renderToString } from "ink";
import { Command } from "commander";
import App from "./ui/App";
import { listTasks, runTask } from "./eval/index";
import { ensureTelemetryConfig, saveConfig } from "./config";
import { isTelemetryEnabled } from "./telemetry/store";
import { generateReport, printReport } from "./telemetry/reporter";
import { startServer } from "./server/index";
import { initProject } from "./init/index";
import { reviewProject, type ReviewResult } from "./review/index";

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

const analyticsCmd = program.command("analytics").description("View telemetry and usage analytics");

analyticsCmd
  .command("report")
  .description("Show analytics report")
  .option("-d, --days <days>", "Number of days to report", "30")
  .action((options: { days: string }) => {
    if (!isTelemetryEnabled()) {
      console.log("\n  Telemetry is disabled. Enable it with: mtc analytics enable\n");
      return;
    }
    const days = parseInt(options.days, 10) || 30;
    const report = generateReport(days);
    printReport(report, days);
  });

analyticsCmd
  .command("enable")
  .description("Enable telemetry and usage tracking")
  .action(() => {
    const { deviceId } = ensureTelemetryConfig();
    saveConfig({ telemetry: { enabled: true, deviceId } });
    console.log("\n  Telemetry enabled. Usage data will be collected locally.\n");
  });

analyticsCmd
  .command("disable")
  .description("Disable telemetry")
  .action(() => {
    saveConfig({ telemetry: { enabled: false, deviceId: ensureTelemetryConfig().deviceId } });
    console.log("\n  Telemetry disabled.\n");
  });

analyticsCmd
  .command("status")
  .description("Show telemetry status")
  .action(() => {
    const enabled = isTelemetryEnabled();
    const cfg = ensureTelemetryConfig();
    console.log(`\n  Telemetry: ${enabled ? "enabled" : "disabled"}`);
    console.log(`  Device ID: ${cfg.deviceId}\n`);
  });

const serveCmd = program.command("serve").description("Start headless WebSocket server");

serveCmd
  .option("-p, --port <port>", "Port to listen on", "8080")
  .option("-H, --host <host>", "Host to bind to", "127.0.0.1")
  .action((options: { port: string; host: string }) => {
    if (!process.stdin.isTTY) {
      console.log("mtc serve: starting headless server...");
    }
    startServer({
      port: parseInt(options.port, 10) || 8080,
      host: options.host,
    });
  });

function printReview(result: ReviewResult, verbose: boolean): void {
  const { summary, findings, passed } = result;
  console.log(`\n  MTC Review: ${passed ? "PASSED" : "FAILED"}`);
  console.log(`  ${"=".repeat(50)}`);
  const { critical, major, minor, suggestion } = summary;
  console.log(
    `  ${summary.total} findings (${critical} critical, ${major} major, ${minor} minor, ${suggestion} suggestion)`,
  );

  const shownFindings = verbose ? findings : findings.filter((f) => f.severity !== "suggestion");
  if (shownFindings.length > 0) {
    console.log();
    for (const f of shownFindings) {
      const badge = f.severity === "critical" ? "CRIT"
        : f.severity === "major" ? "MAJ"
        : f.severity === "minor" ? "MIN" : "SUG";
      const loc = f.line ? `:${f.line}` : "";
      console.log(`  [${badge}] ${f.file}${loc}`);
      console.log(`         ${f.message}`);
    }
  }
  console.log();
}

const initCmd = program.command("init").description("Initialize MTC project configuration");

initCmd
  .argument("[dir]", "Project directory (default: current directory)", ".")
  .option("-f, --framework <framework>", "Project framework (typescript, python, react, nextjs)", "typescript")
  .option("-d, --docs <lang>", "Documentation language: en, jp, both", "en")
  .option("-s, --sqa <level>", "SQA compliance level: basic, strict", "basic")
  .option("-o, --offshore", "Add offshore collaboration rules")
  .option("--force", "Overwrite existing files")
  .action((
    dir: string,
    options: { framework: string; docs: string; sqa: string; offshore?: boolean; force?: boolean },
  ) => {
    const result = initProject({
      dir,
      framework: options.framework,
      docs: options.docs,
      sqa: options.sqa,
      offshore: options.offshore ?? false,
      force: options.force ?? false,
    });

    if (result.errors.length > 0) {
      console.log("\n  Errors:");
      for (const e of result.errors) console.log(`    ${e}`);
    }
    if (result.created.length > 0) {
      console.log(`\n  Created ${result.created.length} files:`);
      for (const f of result.created.sort()) console.log(`    ${f}`);
    }
    console.log();
  });

const reviewCmd = program.command("review").description("Run project review against SQA and coding standards");

reviewCmd
  .option("-d, --dir <dir>", "Project directory (default: current directory)")
  .option("-f, --files <files...>", "Specific files to review (default: all)")
  .option("-v, --verbose", "Show all findings including suggestions")
  .option("--json", "Output as JSON")
  .action((options: { dir?: string; files?: string[]; verbose?: boolean; json?: boolean }) => {
    const result = reviewProject({
      dir: options.dir,
      files: options.files,
      verbose: options.verbose,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
      return;
    }

    printReview(result, options.verbose ?? false);
    process.exit(result.passed ? 0 : 1);
  });

program.parse(process.argv);
