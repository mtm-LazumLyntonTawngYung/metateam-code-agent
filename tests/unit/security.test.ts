import { describe, test, expect } from "bun:test";
import { createHmac } from "crypto";
import {
  validateWebhookRequest,
  validateCloneUrl,
  validateFilePath,
  escapeHtml,
  safeCompare,
} from "../../src/utils/security";
import { prop, randInt, randStr } from "./prop";

describe("webhook validation", () => {
  const secret = "webhook-secret";
  const body = JSON.stringify({ event: "test" });

  test("accepts valid GitHub signature", () => {
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    const result = validateWebhookRequest("github", sig, undefined, body, secret);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  test("rejects invalid GitHub signature with 401", () => {
    const result = validateWebhookRequest("github", "sha256=deadbeef", undefined, body, secret);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test("rejects missing GitHub signature", () => {
    const result = validateWebhookRequest("github", undefined, undefined, body, secret);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test("accepts matching GitLab token", () => {
    const result = validateWebhookRequest("gitlab", undefined, secret, body, secret);
    expect(result.ok).toBe(true);
  });

  test("rejects wrong GitLab token", () => {
    const result = validateWebhookRequest("gitlab", undefined, "wrong", body, secret);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test("fails closed when no secret configured", () => {
    const result = validateWebhookRequest("github", "sha256=whatever", undefined, body, "");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test("safeCompare matches only equal inputs", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
    expect(safeCompare("abc", "abd")).toBe(false);
  });
});

describe("clone URL validation", () => {
  test("accepts valid URLs", () => {
    expect(validateCloneUrl("https://github.com/owner/repo.git")).toBe(true);
    expect(validateCloneUrl("https://github.com/owner/repo")).toBe(true);
    expect(validateCloneUrl("https://gitlab.com/group/subgroup/repo.git")).toBe(true);
    expect(validateCloneUrl("git@github.com:owner/repo.git")).toBe(true);
  });

  test("rejects injection attempts and unknown hosts", () => {
    expect(validateCloneUrl("https://github.com/owner/repo.git --upload-pack=touch /tmp/x")).toBe(false);
    expect(validateCloneUrl("https://github.com/owner/repo; rm -rf /")).toBe(false);
    expect(validateCloneUrl("$(touch /tmp/pwned)")).toBe(false);
    expect(validateCloneUrl("https://evil.com/owner/repo.git")).toBe(false);
  });
});

describe("path traversal prevention", () => {
  test("accepts paths inside base", () => {
    expect(validateFilePath("/tmp/clone", "src/index.ts")).toBe(true);
    expect(validateFilePath("/tmp/clone", "src/deep/file.txt")).toBe(true);
  });

  test("rejects traversal and absolute paths", () => {
    expect(validateFilePath("/tmp/clone", "../etc/passwd")).toBe(false);
    expect(validateFilePath("/tmp/clone", "/etc/passwd")).toBe(false);
    expect(validateFilePath("/tmp/clone", "a/../../etc/passwd")).toBe(false);
  });
});

describe("escapeHtml", () => {
  test("neutralizes HTML injection", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(escapeHtml("a&b")).toBe("a&amp;b");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });
});

describe("Property 1: Security Validation Consistency", () => {
  const secret = "prop-secret";

  test("any valid signature is accepted", () => {
    prop(100, (rand) => {
      const body = randStr(rand, 50, "abcXYZ0123{},\": ");
      const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
      const result = validateWebhookRequest("github", sig, undefined, body, secret);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });
  });

  test("any single-bit signature tamper is rejected", () => {
    prop(100, (rand) => {
      const body = randStr(rand, 50, "abcXYZ0123{}");
      const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
      const pos = randInt(rand, sig.length);
      const flipped = sig.slice(0, pos) + (sig[pos] === "a" ? "b" : "a") + sig.slice(pos + 1);
      const result = validateWebhookRequest("github", flipped, undefined, body, secret);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });
  });

  test("gitlab token: exact match accepted, any difference rejected", () => {
    prop(100, (rand) => {
      const token = randStr(rand, 20, "abcdef0123456789");
      const wrong = token.endsWith("0") ? token.slice(0, -1) + "1" : token.slice(0, -1) + "0";
      expect(validateWebhookRequest("gitlab", undefined, token, "", token).ok).toBe(true);
      expect(validateWebhookRequest("gitlab", undefined, wrong, "", token).ok).toBe(false);
      expect(validateWebhookRequest("gitlab", undefined, undefined, "", token).ok).toBe(false);
    });
  });

  test("result is deterministic across calls", () => {
    prop(100, (rand) => {
      const body = randStr(rand, 30, "abc");
      const a = validateWebhookRequest("github", "sha256=bad", undefined, body, secret);
      const b = validateWebhookRequest("github", "sha256=bad", undefined, body, secret);
      expect(a).toEqual(b);
    });
  });
});

describe("Property 2: Input Sanitization Safety", () => {
  test("escapeHtml leaves no raw HTML metacharacters", () => {
    prop(100, (rand) => {
      const input = randStr(rand, 40, 'abc<>\"/\'& \t\ndef');
      const out = escapeHtml(input);
      expect(out).not.toContain("<");
      expect(out).not.toContain(">");
      expect(out).not.toContain('"');
      expect(out).not.toContain("'");
    });
  });

  test("escapeHtml preserves safe input", () => {
    prop(100, (rand) => {
      const input = randStr(rand, 40, "abcXYZ0123 -_.");
      expect(escapeHtml(input)).toBe(input);
    });
  });

  test("clone URLs with any shell metacharacter are rejected", () => {
    const dangerous = [" ", ";", "&", "|", "$", "`", '"', "'", "(", ")", "\n"];
    prop(100, (rand) => {
      const base = randStr(rand, 8, "abcXYZ123/-._");
      for (const c of dangerous) {
        expect(validateCloneUrl(`https://github.com/o/${base}${c}repo`)).toBe(false);
      }
    });
  });

  test("paths with .. segments are rejected", () => {
    prop(100, (rand) => {
      const ups = "../".repeat(1 + randInt(rand, 4));
      const name = randStr(rand, 6, "abc123");
      expect(validateFilePath("/tmp/clone", ups + name)).toBe(false);
    });
  });
});
