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
  tempDir: "/tmp/mtc-daemon",
};

export function loadDaemonConfig(options: {
  port?: string;
  host?: string;
  webhookSecret?: string;
  githubToken?: string;
  gitlabToken?: string;
  slackWebhook?: string;
  teamsWebhook?: string;
}): DaemonConfig {
  return {
    ...DEFAULT_DAEMON_CONFIG,
    ...(options.port ? { port: parseInt(options.port, 10) || DEFAULT_DAEMON_CONFIG.port } : {}),
    ...(options.host ? { host: options.host } : {}),
    ...(options.webhookSecret ? { webhookSecret: options.webhookSecret } : {}),
    ...(options.githubToken ? { githubToken: options.githubToken } : {}),
    ...(options.gitlabToken ? { gitlabToken: options.gitlabToken } : {}),
    ...(options.slackWebhook ? { slackWebhook: options.slackWebhook } : {}),
    ...(options.teamsWebhook ? { teamsWebhook: options.teamsWebhook } : {}),
  };
}
