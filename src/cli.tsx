import { render, renderToString } from "ink";
import { Command } from "commander";
import App from "./ui/App";
import { listTasks, runTask } from "./eval/index";
import { ensureTelemetryConfig, saveConfig } from "./config";
import { isTelemetryEnabled } from "./telemetry/store";
import { generateReport, printReport } from "./telemetry/reporter";
import { startServer } from "./server/index";

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

program.parse(process.argv);
