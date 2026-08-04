import type { NotificationMessage, PipelineStatus } from "./types";
import { logger } from "../utils/logger";

const NOTIFICATION_RETRIES = 3;
const NOTIFICATION_BASE_DELAY_MS = 500;

export async function sendNotification(
  channel: "slack" | "teams",
  webhookUrl: string,
  msg: NotificationMessage,
): Promise<void> {
  const body = channel === "slack" ? buildSlackPayload(msg) : buildTeamsPayload(msg);

  for (let attempt = 0; attempt < NOTIFICATION_RETRIES; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        logger.info("Notification sent", { channel, status: res.status });
        return;
      }
      const text = await res.text().catch(() => "");
      logger.warn("Notification attempt failed", { channel, status: res.status, body: text, attempt });
    } catch (err) {
      logger.warn("Notification attempt error", { channel, error: err instanceof Error ? err.message : String(err), attempt });
    }
    if (attempt < NOTIFICATION_RETRIES - 1) {
      const delay = NOTIFICATION_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  logger.error("Notification failed after retries", { channel, webhookUrl, title: msg.title });
}

function statusColor(status: PipelineStatus): string {
  switch (status) {
    case "success": return "#36a64f";
    case "failure": return "#dc3545";
    case "running": return "#ffc107";
    default: return "#6c757d";
  }
}

function statusEmoji(status: PipelineStatus): string {
  switch (status) {
    case "success": return "\u2705";
    case "failure": return "\u274C";
    case "running": return "\uD83D\uDD04";
    default: return "\u23F3";
  }
}

function buildSlackPayload(msg: NotificationMessage): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${statusEmoji(msg.status)} ${msg.title}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: msg.text },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Repo:*\n<${msg.repoUrl}|${msg.repoUrl.split("/").slice(-2).join("/")}>` },
        { type: "mrkdwn", text: `*Issue:*\n<${msg.issueUrl}|#${msg.issueUrl.split("/").pop()}>` },
        { type: "mrkdwn", text: `*Time:*\n${msg.timestamp}` },
        ...(msg.prUrl ? [{ type: "mrkdwn" as const, text: `*PR:*\n<${msg.prUrl}|Draft PR>` }] : []),
      ],
    },
  ];

  return {
    text: msg.title,
    attachments: [{ color: statusColor(msg.status), blocks }],
  };
}

function buildTeamsPayload(msg: NotificationMessage): Record<string, unknown> {
  const facts: Array<{ name: string; value: string }> = [
    { name: "Status", value: msg.status },
    { name: "Repository", value: msg.repoUrl },
    { name: "Issue", value: msg.issueUrl },
    { name: "Time", value: msg.timestamp },
  ];

  if (msg.prUrl) {
    facts.push({ name: "Pull Request", value: msg.prUrl });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          body: [
            {
              type: "TextBlock",
              size: "Large",
              weight: "Bolder",
              text: `${statusEmoji(msg.status)} ${msg.title}`,
            },
            {
              type: "TextBlock",
              text: msg.text,
              wrap: true,
            },
            {
              type: "FactSet",
              facts,
            },
          ],
          actions: msg.prUrl
            ? [{ type: "Action.OpenUrl", title: "View Pull Request", url: msg.prUrl }]
            : [],
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
        },
      },
    ],
  };
}
