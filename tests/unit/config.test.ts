import { describe, test, expect } from "bun:test";
import {
  CONFIG_SCHEMA,
  getConfigDefaults,
  validateConfig,
  maskConfig,
  flattenSchema,
} from "../../src/config/schema";
import { prop, randInt, randStr } from "./prop";

describe("Property 14: Configuration Management Consistency", () => {
  test("defaults are complete, valid, and match every leaf in the schema", () => {
    const defaults = getConfigDefaults() as Record<string, unknown>;
    const leaves = flattenSchema().filter((f) => !f.schema.fields);
    expect(leaves.length).toBeGreaterThan(0);

    for (const leaf of leaves) {
      const parts = leaf.path.split(".");
      let node: unknown = defaults;
      for (const part of parts) {
        expect(typeof node).toBe("object");
        node = (node as Record<string, unknown>)[part];
      }
      expect(node).not.toBeUndefined();
      expect(node).not.toBeNull();
    }

    const result = validateConfig(defaults);
    expect(result.ok).toBe(true);
  });

  test("unknown keys are stripped and never survive normalization", () => {
    prop(200, (rand) => {
      const junk: Record<string, unknown> = {};
      for (let i = 0; i < 5; i++) {
        junk[`unknown_${randStr(rand, 8, "abcXYZ0123")}`] = randStr(rand, 1 + randInt(rand, 10), "abc");
      }
      const result = validateConfig(junk);
      expect(result.ok).toBe(true);
      expect(Object.keys(result.normalized)).toEqual([]);
    });
  });

  test("validating any object never throws and always yields a normalized object", () => {
    prop(300, (rand) => {
      const input = randomNested(rand, 2);
      expect(() => validateConfig(input)).not.toThrow();
      const result = validateConfig(input);
      expect(typeof result.ok).toBe("boolean");
      expect(result.normalized).toBeTruthy();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  test("type violations are always reported, never silently accepted", () => {
    prop(200, (rand) => {
      const bad: Record<string, unknown> = {
        telemetry: { enabled: randStr(rand, 1 + randInt(rand, 5), "abc") },
        organization: { name: 42 },
      };
      const result = validateConfig(bad);
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  test("masking never reveals full secret values", () => {
    prop(200, (rand) => {
      const secret = randStr(rand, 12, "abcdefghijklmnopqrstuvwxyz0123456789");
      const cfg = {
        apiKey: secret,
        auth: { clientSecret: secret },
      };
      const masked = maskConfig(cfg) as Record<string, unknown>;
      const maskedAuth = masked.auth as Record<string, unknown>;
      expect(masked.apiKey).not.toContain(secret);
      expect(maskedAuth.clientSecret).not.toContain(secret);
      if (typeof masked.apiKey === "string" && masked.apiKey.length > 0) {
        expect(masked.apiKey).toMatch(/^\*+$/);
      }
    });
  });

  test("masked secrets differ from their plaintext across schemas", () => {
    const secrets = ["s3cret-api-key", "token-value"];
    for (const secret of secrets) {
      const masked = maskConfig({ apiKey: secret }) as Record<string, unknown>;
      expect(masked.apiKey).not.toBe(secret);
    }
  });

  test("every schema leaf has a stable, unique path", () => {
    const leaves = flattenSchema();
    const paths = leaves.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(CONFIG_SCHEMA.length).toBeGreaterThan(0);
  });

  test("validateConfig enforces URL pattern on endpoint fields", () => {
    prop(100, (rand) => {
      const badUrl = randStr(rand, 10, "abcdef") + "://" + randStr(rand, 4, "xyz");
      const result = validateConfig({
        endpoint: badUrl,
        telemetry: { endpoint: badUrl },
      });
      const endpointField = result.errors.filter((e) => e.includes("endpoint"));
      expect(endpointField.length).toBeGreaterThan(0);
    });
  });
});

function randomNested(rand: () => number, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = ["apiKey", "endpoint", "selectedModel", "agentId", "themeId", "organization", "auth", "telemetry", "llm"];
  const count = randInt(rand, keys.length);
  for (let i = 0; i < count; i++) {
    const key = keys[randInt(rand, keys.length)];
    out[key] = randomValue(rand, depth);
  }
  return out;
}

function randomValue(rand: () => number, depth: number): unknown {
  const kind = randInt(rand, 5);
  if (kind === 0) return randInt(rand, 1000);
  if (kind === 1) return randStr(rand, 1 + randInt(rand, 8), "abc");
  if (kind === 2) return Math.random() > 0.5;
  if (kind === 3) return [randStr(rand, 3, "abc"), randStr(rand, 3, "123")];
  if (kind === 4 && depth > 0) return randomNested(rand, depth - 1);
  return null;
}
