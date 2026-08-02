import { createHash, createHmac, timingSafeEqual } from "crypto";
import { isAbsolute, relative, resolve } from "path";

export type WebhookValidationResult = {
  ok: boolean;
  status: number;
  message: string;
};

export function safeCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function validateWebhookRequest(
  platform: "github" | "gitlab",
  signature: string | undefined,
  gitlabToken: string | undefined,
  body: string,
  secret: string,
): WebhookValidationResult {
  if (!secret) {
    return { ok: false, status: 401, message: "Webhook secret not configured" };
  }

  if (platform === "github") {
    if (!signature) {
      return { ok: false, status: 401, message: "Missing signature" };
    }
    const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    return safeCompare(expected, signature)
      ? { ok: true, status: 200, message: "Valid signature" }
      : { ok: false, status: 401, message: "Invalid signature" };
  }

  if (!gitlabToken) {
    return { ok: false, status: 401, message: "Missing token" };
  }
  return safeCompare(secret, gitlabToken)
    ? { ok: true, status: 200, message: "Valid token" }
    : { ok: false, status: 401, message: "Invalid token" };
}

const CLONE_URL_RE =
  /^(?:https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+(?:\.git)?|https:\/\/gitlab\.com\/[A-Za-z0-9_./-]+(?:\.git)?|git@github\.com:[A-Za-z0-9_./-]+\.git)$/;

export function validateCloneUrl(url: string): boolean {
  return CLONE_URL_RE.test(url);
}

export function validateFilePath(basePath: string, targetPath: string): boolean {
  const base = resolve(basePath);
  const target = resolve(base, targetPath);
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function escapeHtml(input: string): string {
  return String(input).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
