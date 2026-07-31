import { startWebhookServer } from "./webhook";
import type { DaemonConfig } from "./config";
export type { DaemonConfig } from "./config";

export function startDaemon(config: DaemonConfig): void {
  console.log(`mtc daemon starting on ${config.host}:${config.port}`);
  console.log(`  autofix label: "${config.autofixLabel}"`);
  if (config.slackWebhook) console.log("  Slack notifications: enabled");
  if (config.teamsWebhook) console.log("  Teams notifications: enabled");

  process.on("SIGINT", () => {
    console.log("\nmtc daemon shutting down...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\nmtc daemon shutting down...");
    process.exit(0);
  });

  startWebhookServer(config);
}
