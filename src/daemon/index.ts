import { startWebhookServer } from "./webhook";
import type { DaemonConfig } from "./config";
import { logger } from "../utils/logger";
export type { DaemonConfig } from "./config";

export function startDaemon(config: DaemonConfig): void {
  logger.info("mtc daemon starting", {
    host: config.host,
    port: config.port,
    autofixLabel: config.autofixLabel,
    slack: Boolean(config.slackWebhook),
    teams: Boolean(config.teamsWebhook),
  });

  process.on("SIGINT", () => {
    logger.info("mtc daemon shutting down (SIGINT)");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    logger.info("mtc daemon shutting down (SIGTERM)");
    process.exit(0);
  });

  startWebhookServer(config);
}
