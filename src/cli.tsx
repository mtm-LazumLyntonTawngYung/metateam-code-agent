import { render, renderToString } from "ink";
import { registerCleanup } from "./ui/clean-exit";
import { Command } from "commander";
import App from "./ui/App";
import { clearAuth, isAuthenticated, getAuth } from "./auth/index";
import { listTasks, runTask } from "./eval/index";
import { ensureTelemetryConfig, saveConfig } from "./config";
import { isTelemetryEnabled } from "./telemetry/store";
import { generateReport, printReport } from "./telemetry/reporter";
import { startServer } from "./server/index";
import { initProject } from "./init/index";
import { reviewProject, type ReviewResult } from "./review/index";
import {
  loadLlmConfig,
  saveLlmConfig,
  updateProvider,
  routeTask,
  classifyTask,
  KNOWN_MODELS,
} from "./llm/index";
import { startDaemon } from "./daemon/index";
import { loadDaemonConfig } from "./daemon/config";
import {
  activateLicense,
  deactivateLicense,
  getLicense,
  formatLicenseInfo,
  generateLicenseKey,
  hasFeature,
  isEnterprise,
  queryAuditLogs,
  getSystemStatus,
  startDashboard,
  createOrganization,
  listOrganizations,
  type LicenseInfo,
  type Tier,
} from "./enterprise/index";

const program = new Command();

program
  .name("mtc")
  .description("Metateam Code Agent — AI-powered terminal-first coding assistant")
  .version("1.0.0")
  .action(async () => {
    if (process.stdin.isTTY) {
      const { waitUntilExit, cleanup } = render(<App />);
      registerCleanup(cleanup);
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

const daemonCmd = program.command("daemon").description("Start headless daemon with webhook listener for autonomous autofix");

daemonCmd
  .option("-p, --port <port>", "Port to listen on", "8080")
  .option("-H, --host <host>", "Host to bind to", "0.0.0.0")
  .option("-s, --webhook-secret <secret>", "Webhook secret for signature verification")
  .option("-t, --github-token <token>", "GitHub personal access token")
  .option("-g, --gitlab-token <token>", "GitLab personal access token")
  .option("--slack-webhook <url>", "Slack webhook URL for notifications")
  .option("--teams-webhook <url>", "Teams webhook URL for notifications")
  .option("-l, --autofix-label <label>", "Issue label that triggers autofix", "autofix")
  .action((options: {
    port: string;
    host: string;
    webhookSecret?: string;
    githubToken?: string;
    gitlabToken?: string;
    slackWebhook?: string;
    teamsWebhook?: string;
    autofixLabel: string;
  }) => {
    if (!options.githubToken && !options.gitlabToken) {
      console.error("Error: --github-token or --gitlab-token is required");
      process.exit(1);
    }
    const config = loadDaemonConfig(options);
    startDaemon(config);
  });

const enterpriseCmd = program.command("enterprise").description("Enterprise license management and control plane");

enterpriseCmd
  .command("status")
  .description("Show enterprise license and system status")
  .action(() => {
    const status = getSystemStatus();
    const license = getLicense();
    console.log(`\n  MTC Enterprise Status`);
    console.log(`  ${"=".repeat(50)}`);
    console.log(`  Tier:           ${status.tier}`);
    console.log(`  License:        ${status.licenseStatus}`);
    console.log(`  Organization:   ${license.organization}`);
    console.log(`  Seats:          ${license.currentSeats}/${license.maxSeats}`);
    console.log(`  Expires:        ${license.expiresAt.slice(0, 10)}`);
    console.log(`  MCP Servers:    ${status.connectedMcpServers} connected`);
    console.log(`  Features:`);
    for (const f of status.features) {
      console.log(`    ${f.available ? "\u2705" : "\u274C"} ${f.feature.replace(/_/g, " ")} (${f.tier})`);
    }
    console.log();
  });

enterpriseCmd
  .command("activate")
  .description("Activate an enterprise license key")
  .argument("<key>", "License key")
  .action((key: string) => {
    const result = activateLicense(key);
    if (result.success) {
      console.log(`\n  License activated successfully!`);
      console.log(`  Tier: ${result.license!.tier}`);
      console.log(`  Features: ${result.license!.features.join(", ")}\n`);
    } else {
      console.error(`\n  Activation failed: ${result.error}\n`);
      process.exit(1);
    }
  });

enterpriseCmd
  .command("deactivate")
  .description("Deactivate the current license")
  .action(() => {
    deactivateLicense();
    console.log("\n  License deactivated. Reverted to community tier.\n");
  });

enterpriseCmd
  .command("generate")
  .description("Generate a new license key")
  .requiredOption("-t, --tier <tier>", "License tier: community, enterprise, enterprise-plus")
  .requiredOption("-o, --org <name>", "Organization name")
  .option("-e, --expires <date>", "Expiration date (ISO 8601)", new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString())
  .option("-s, --seats <number>", "Max seats", "50")
  .action((options: { tier: string; org: string; expires: string; seats: string }) => {
    const key = generateLicenseKey(
      options.tier as Tier,
      options.org,
      options.expires,
      parseInt(options.seats, 10) || 50,
    );
    console.log(`\n  Generated License Key:`);
    console.log(`  ${key}`);
    console.log(`  Tier:    ${options.tier}`);
    console.log(`  Org:     ${options.org}`);
    console.log(`  Expires: ${options.expires.slice(0, 10)}`);
    console.log(`  Seats:   ${options.seats}\n`);
  });

enterpriseCmd
  .command("dashboard")
  .description("Start the enterprise control plane web dashboard")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("-H, --host <host>", "Host to bind to", "127.0.0.1")
  .action((options: { port: string; host: string }) => {
    if (!isEnterprise()) {
      console.error("\n  Enterprise dashboard requires an enterprise license.");
      console.error("  Activate one with: mtc enterprise activate <key>\n");
      process.exit(1);
    }
    console.log(`\n  Starting MTC Enterprise Control Plane...\n`);
    startDashboard(parseInt(options.port, 10) || 3000, options.host);
  });

enterpriseCmd
  .command("audit")
  .description("Query enterprise audit logs")
  .option("-l, --limit <count>", "Number of entries", "20")
  .option("-a, --actor <name>", "Filter by actor")
  .option("-s, --since <date>", "Show entries after this date")
  .action((options: { limit: string; actor?: string; since?: string }) => {
    if (!isEnterprise()) {
      console.error("\n  Audit logs require an enterprise license.\n");
      process.exit(1);
    }
    const logs = queryAuditLogs({
      limit: parseInt(options.limit, 10) || 20,
      actor: options.actor,
      since: options.since,
    });
    if (logs.length === 0) {
      console.log("\n  No audit entries found.\n");
      return;
    }
    console.log(`\n  Audit Log (${logs.length} entries):`);
    console.log(`  ${"=".repeat(60)}`);
    for (const log of logs) {
      console.log(`  ${log.timestamp.slice(0, 19)}  ${log.actor.padEnd(16)} ${log.action.padEnd(20)} ${log.resource}`);
    }
    console.log();
  });

enterpriseCmd
  .command("org")
  .description("Manage organizations")
  .argument("<action>", "Action: list, create")
  .argument("[name]", "Organization name (for create)")
  .argument("[slug]", "Organization slug (for create)")
  .action((action: string, name?: string, slug?: string) => {
    if (action === "list") {
      const orgs = listOrganizations();
      if (orgs.length === 0) {
        console.log("\n  No organizations found.\n");
        return;
      }
      console.log(`\n  Organizations (${orgs.length}):`);
      console.log(`  ${"=".repeat(50)}`);
      for (const org of orgs) {
        console.log(`  ${org.name.padEnd(20)} ${org.tier.padEnd(15)} ${org.members.length} members`);
      }
      console.log();
    } else if (action === "create") {
      if (!name || !slug) {
        console.error("\n  Usage: mtc enterprise org create <name> <slug>\n");
        process.exit(1);
      }
      const org = createOrganization(name, slug);
      console.log(`\n  Organization created:`);
      console.log(`  ID:   ${org.id}`);
      console.log(`  Name: ${org.name}`);
      console.log(`  Slug: ${org.slug}\n`);
    } else {
      console.error(`\n  Unknown action: ${action}. Use: list, create\n`);
      process.exit(1);
    }
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

const llmCmd = program.command("llm").description("Configure LLM providers and routing");

llmCmd
  .command("status")
  .description("Show configured providers and routing")
  .action(() => {
    const cfg = loadLlmConfig();
    console.log(`\n  LLM Configuration`);
    console.log(`  ${"=".repeat(50)}`);
    console.log(`\n  Providers:`);
    for (const p of cfg.providers) {
      const key = p.apiKey ? `${p.apiKey.slice(0, 8)}...` : "not set";
      console.log(`    ${p.id.padEnd(14)} ${p.label.padEnd(12)} key: ${key}`);
      console.log(`    ${"".padEnd(14)} ${p.baseUrl}`);
      console.log(`    ${"".padEnd(14)} models: ${p.models.join(", ")}`);
    }
    console.log(`\n  Routing:`);
    console.log(`    Simple tasks:    ${cfg.routing.simpleModel}`);
    console.log(`    Default tasks:   ${cfg.routing.defaultModel}`);
    console.log(`    Complex tasks:   ${cfg.routing.reasoningModel}`);
    console.log();
  });

llmCmd
  .command("set-provider")
  .description("Configure a provider")
  .requiredOption("-i, --id <id>", "Provider ID (deepseek, openai, anthropic, openrouter)")
  .requiredOption("-k, --key <key>", "API key")
  .option("-u, --url <url>", "API base URL")
  .option("-m, --models <models...>", "Model IDs to enable")
  .action((options: { id: string; key: string; url?: string; models?: string[] }) => {
    const cfg = loadLlmConfig();
    const existing = cfg.providers.find((p) => p.id === options.id);
    const labels: Record<string, string> = {
      deepseek: "DeepSeek", openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter",
    };
    const defaultUrls: Record<string, string> = {
      deepseek: "https://api.deepseek.com/v1",
      openai: "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com/v1",
      openrouter: "https://openrouter.ai/api/v1",
    };
    updateProvider({
      id: options.id as "deepseek" | "openai" | "anthropic" | "openrouter",
      label: existing?.label ?? labels[options.id] ?? options.id,
      apiKey: options.key,
      baseUrl: options.url ?? existing?.baseUrl ?? defaultUrls[options.id] ?? `https://api.${options.id}.com/v1`,
      models: options.models ?? existing?.models ?? [],
    });
    console.log(`\n  Provider '${options.id}' updated.\n`);
  });

llmCmd
  .command("set-routing")
  .description("Configure routing models")
  .option("-s, --simple <model>", "Model for simple tasks")
  .option("-d, --default <model>", "Model for medium tasks")
  .option("-r, --reasoning <model>", "Model for complex tasks")
  .action((options: { simple?: string; default?: string; reasoning?: string }) => {
    const cfg = loadLlmConfig();
    saveLlmConfig({
      routing: {
        simpleModel: options.simple ?? cfg.routing.simpleModel,
        defaultModel: options.default ?? cfg.routing.defaultModel,
        reasoningModel: options.reasoning ?? cfg.routing.reasoningModel,
      },
    });
    console.log(`\n  Routing updated.\n`);
  });

llmCmd
  .command("classify")
  .description("Test task classification")
  .argument("<query>", "Task description to classify")
  .option("-f, --files <count>", "Number of files involved", "1")
  .action((query: string, options: { files: string }) => {
    const fileCount = parseInt(options.files, 10) || 1;
    const decision = routeTask(query, fileCount);
    console.log(`\n  Query: ${query}`);
    console.log(`  Files: ${fileCount}`);
    console.log(`  Complexity: ${decision.complexity}`);
    console.log(`  Routed to: ${decision.model.displayName} (${decision.model.id})`);
    console.log(`  Reason: ${decision.reason}`);
    console.log();
  });

llmCmd
  .command("models")
  .description("List all known models")
  .action(() => {
    console.log(`\n  Known Models:`);
    console.log(`  ${"=".repeat(50)}`);
    for (const m of KNOWN_MODELS) {
      const cost = `\$${m.costPer1kInput.toFixed(5)}/1K in | \$${m.costPer1kOutput.toFixed(5)}/1K out`;
      console.log(`    ${m.id.padEnd(30)} ${m.tier.padEnd(10)} ${cost}`);
      console.log(`    ${"".padEnd(30)} ${m.displayName} (ctx: ${(m.contextWindow / 1000).toFixed(0)}K)`);
    }
    console.log();
  });

const authCmd = program.command("auth").description("Microsoft Entra ID SSO authentication");

authCmd
  .command("logout")
  .description("Clear local auth session and log out")
  .action(() => {
    const auth = getAuth();
    if (auth) {
      clearAuth();
      console.log(`\n  Logged out ${auth.userEmail}. Auth session cleared.\n`);
    } else {
      console.log("\n  No active auth session found.\n");
    }
  });

program.parse(process.argv);
