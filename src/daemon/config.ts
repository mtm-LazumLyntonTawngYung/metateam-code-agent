import { tmpdir } from "os";
import { join } from "path";

export type DaemonConfig = {
  port: number;
  host: string;
  webhookSecret?: string;
  githubToken?: string;
  gitlabToken?: string;
  slackWebhook?: string;
  teamsWebhook?: string;
  autofixLabel: string;
  maxConcurrentJobs: number;
  tempDir: string;
};

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  port: 8080,
  host: "0.0.0.0",
  autofixLabel: "autofix",
  maxConcurrentJobs: 3,
  tempDir: join(tmpdir(), "mtc-daemon"),
};

function warnCliSecret(name: string): void {
  const envVar = `MTC_${name.replace(/-/g, "_").replace(/[A-Z]/g, "_$&").toUpperCase()}`;
  console.error(`[mtc] WARNING: ${name} passed via CLI flag — visible in process listings. Use ${envVar} env var instead.`);
}

export function loadDaemonConfig(options: {
  port?: string;
  host?: string;
  webhookSecret?: string;
  githubToken?: string;
  gitlabToken?: string;
  slackWebhook?: string;
  teamsWebhook?: string;
}): DaemonConfig {
  const githubToken = options.githubToken ?? process.env.MTC_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  const gitlabToken = options.gitlabToken ?? process.env.MTC_GITLAB_TOKEN ?? process.env.GITLAB_TOKEN;
  const webhookSecret = options.webhookSecret ?? process.env.MTC_WEBHOOK_SECRET;
  const slackWebhook = options.slackWebhook ?? process.env.MTC_SLACK_WEBHOOK;
  const teamsWebhook = options.teamsWebhook ?? process.env.MTC_TEAMS_WEBHOOK;

  if (options.githubToken) warnCliSecret("github-token");
  if (options.gitlabToken) warnCliSecret("gitlab-token");
  if (options.webhookSecret) warnCliSecret("webhook-secret");
  if (options.slackWebhook) warnCliSecret("slack-webhook");
  if (options.teamsWebhook) warnCliSecret("teams-webhook");

  return {
    ...DEFAULT_DAEMON_CONFIG,
    ...(options.port ? { port: parseInt(options.port, 10) || DEFAULT_DAEMON_CONFIG.port } : {}),
    ...(options.host ? { host: options.host } : {}),
    ...(webhookSecret ? { webhookSecret } : {}),
    ...(githubToken ? { githubToken } : {}),
    ...(gitlabToken ? { gitlabToken } : {}),
    ...(slackWebhook ? { slackWebhook } : {}),
    ...(teamsWebhook ? { teamsWebhook } : {}),
  };
}
