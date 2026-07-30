import type { DaemonConfig } from "./config";
import type { WebhookEvent, IssuePayload, RepoPayload } from "./types";
import { runPipeline } from "./pipeline";

type WebhookPayload = {
  event: string;
  payload: Record<string, unknown>;
  signature?: string;
  platform: "github" | "gitlab";
};

const whRateBuckets = new Map<string, { count: number; resetAt: number }>();

function whCheckRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = whRateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    whRateBuckets.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  bucket.count++;
  return bucket.count <= 30;
}

export function startWebhookServer(config: DaemonConfig): void {
  Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req) {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
      if (!whCheckRateLimit(clientIp)) {
        return new Response("Rate limit exceeded", { status: 429 });
      }

      const url = new URL(req.url);
      if (url.pathname !== "/webhook") {
        return new Response("Not found", { status: 404 });
      }

      const rawBody = await req.text();
      if (rawBody.length > 1024 * 1024) {
        return new Response("Payload too large", { status: 413 });
      }

      const body = rawBody;
      const contentType = req.headers.get("content-type") ?? "";
      const githubEvent = req.headers.get("x-github-event");
      const gitlabEvent = req.headers.get("x-gitlab-event");
      const signature = req.headers.get("x-hub-signature-256") ?? undefined;

      let wh: WebhookPayload;
      try {
        if (githubEvent) {
          wh = { event: githubEvent, payload: JSON.parse(body), signature, platform: "github" };
        } else if (gitlabEvent) {
          wh = { event: gitlabEvent, payload: JSON.parse(body), signature, platform: "gitlab" };
        } else {
          return new Response("Unknown webhook source", { status: 400 });
        }
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      if (config.webhookSecret && wh.signature) {
        const expected = await verifySignature(body, config.webhookSecret, wh.signature);
        if (!expected) {
          return new Response("Invalid signature", { status: 401 });
        }
      }

      const parsed = parseWebhookEvent(wh);
      if (!parsed) {
        return new Response("Event ignored", { status: 200 });
      }

      runPipeline(parsed, config).catch((err) => {
        console.error(`Pipeline error: ${err instanceof Error ? err.message : String(err)}`);
      });

      return new Response("Accepted", { status: 202 });
    },
  });
}

function parseWebhookEvent(wh: WebhookPayload): WebhookEvent | null {
  const p = wh.payload;

  if (wh.platform === "github") {
    if (wh.event === "issues" && p.action === "labeled") {
      return parseGitHubIssue(p, "issue.labeled");
    }
    if (wh.event === "issues" && p.action === "opened") {
      return parseGitHubIssue(p, "issue.opened");
    }
    if (wh.event === "push") {
      return parseGitHubPush(p);
    }
  }

  if (wh.platform === "gitlab") {
    if (wh.event === "Issue Hook") {
      return parseGitLabIssue(p);
    }
    if (wh.event === "Push Hook") {
      return parseGitLabPush(p);
    }
  }

  return null;
}

function parseGitHubIssue(payload: Record<string, unknown>, event: "issue.labeled" | "issue.opened"): WebhookEvent | null {
  const issue = payload.issue as Record<string, unknown> | undefined;
  const repo = payload.repository as Record<string, unknown> | undefined;
  const sender = payload.sender as Record<string, unknown> | undefined;
  if (!issue || !repo) return null;

  const labels = (issue.labels as Array<Record<string, unknown>> | undefined)?.map((l) => String(l.name ?? "")) ?? [];

  return {
    event,
    issue: {
      id: (issue.id as number) ?? 0,
      number: (issue.number as number) ?? 0,
      title: String(issue.title ?? ""),
      body: String(issue.body ?? ""),
      labels,
      repoFullName: String(repo.full_name ?? ""),
      repoCloneUrl: String(repo.clone_url ?? ""),
      htmlUrl: String(issue.html_url ?? ""),
      sender: String((sender as Record<string, unknown> | undefined)?.login ?? ""),
    },
    platform: "github",
  };
}

function parseGitHubPush(payload: Record<string, unknown>): WebhookEvent | null {
  const repo = payload.repository as Record<string, unknown> | undefined;
  if (!repo) return null;

  return {
    event: "push",
    repo: {
      fullName: String(repo.full_name ?? ""),
      cloneUrl: String(repo.clone_url ?? ""),
      branch: String(payload.ref ?? "").replace("refs/heads/", ""),
      defaultBranch: String(repo.default_branch ?? "main"),
      htmlUrl: String(repo.html_url ?? ""),
    },
    platform: "github",
  };
}

function parseGitLabIssue(payload: Record<string, unknown>): WebhookEvent | null {
  const attrs = payload.object_attributes as Record<string, unknown> | undefined;
  const project = payload.project as Record<string, unknown> | undefined;
  const labels = payload.labels as Array<Record<string, unknown>> | undefined;
  if (!attrs || !project) return null;

  const action = String(attrs.action ?? "");
  const event = action === "open" ? "issue.opened" as const : action === "label" ? "issue.labeled" as const : null;
  if (!event) return null;

  return {
    event,
    issue: {
      id: (attrs.id as number) ?? 0,
      number: (attrs.iid as number) ?? 0,
      title: String(attrs.title ?? ""),
      body: String(attrs.description ?? ""),
      labels: labels?.map((l) => String(l.title ?? "")) ?? [],
      repoFullName: String(project.path_with_namespace ?? project.name ?? ""),
      repoCloneUrl: String(project.git_http_url ?? ""),
      htmlUrl: String(attrs.url ?? ""),
      sender: String((payload.user as Record<string, unknown> | undefined)?.username ?? ""),
    },
    platform: "gitlab",
  };
}

function parseGitLabPush(payload: Record<string, unknown>): WebhookEvent | null {
  const project = payload.project as Record<string, unknown> | undefined;
  if (!project) return null;

  return {
    event: "push",
    repo: {
      fullName: String(project.path_with_namespace ?? project.name ?? ""),
      cloneUrl: String(project.git_http_url ?? ""),
      branch: String(payload.ref ?? "").replace("refs/heads/", ""),
      defaultBranch: String(payload.default_branch ?? "main"),
      htmlUrl: String(project.web_url ?? ""),
    },
    platform: "gitlab",
  };
}

async function verifySignature(body: string, secret: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = "sha256=" + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === signature;
}
