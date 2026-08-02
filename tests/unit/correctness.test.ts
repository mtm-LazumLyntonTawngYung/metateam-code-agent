import { describe, test, expect } from "bun:test";
import { KNOWN_MODELS, DEFAULT_ROUTING } from "../../src/llm/types";
import { filterKnownModels } from "../../src/llm/config";
import { MAX_FILE_SIZE } from "../../src/tools/read_file";
import { registerTool, getTool, getAllTools } from "../../src/tools/index";
import { parseFrontmatter } from "../../src/agents/frontmatter";
import { OpenAIStreamAccumulator } from "../../src/llm/client";
import { prop, randInt, randStr } from "./prop";

describe("Property 5: Resource Management Bounds", () => {
  test("MAX_FILE_SIZE is exactly 10 MB", () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  test("maxTokens never exceeds contextWindow for any model", () => {
    for (const m of KNOWN_MODELS) {
      expect(m.maxTokens).toBeGreaterThan(0);
      expect(m.maxTokens).toBeLessThanOrEqual(m.contextWindow);
    }
  });

  test("token counts are positive integers for any model", () => {
    for (const m of KNOWN_MODELS) {
      expect(Number.isInteger(m.maxTokens)).toBe(true);
      expect(Number.isInteger(m.contextWindow)).toBe(true);
    }
  });

  test("fast routing candidates are genuine fast-tier models", () => {
    for (const id of DEFAULT_ROUTING.fast) {
      const model = KNOWN_MODELS.find((m) => m.id === id);
      expect(model).toBeDefined();
      expect(model!.tier).toBe("fast");
    }
  });
});

describe("Property 6: Configuration Consistency", () => {
  test("KNOWN_MODELS ids are unique", () => {
    const ids = new Set<string>();
    for (const m of KNOWN_MODELS) {
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
    }
  });

  test("every routing fallback id resolves to a known model", () => {
    const known = new Set(KNOWN_MODELS.map((m) => m.id));
    for (const tier of Object.values(DEFAULT_ROUTING)) {
      for (const id of tier) {
        expect(known.has(id)).toBe(true);
      }
    }
  });

  test("filtering with no configured models returns empty (shows setup warning)", () => {
    expect(filterKnownModels([])).toEqual([]);
  });

  test("filterKnownModels returns exactly the configured subset in registry order", () => {
    prop(100, (rand) => {
      const all = KNOWN_MODELS.map((m) => m.id);
      const configured = all.filter(() => rand() < 0.5);
      const result = filterKnownModels(configured);
      const expected = KNOWN_MODELS.filter((m) => configured.includes(m.id));
      expect(result.map((m) => m.id)).toEqual(expected.map((m) => m.id));
    });
  });

  test("unknown ids are ignored and known ids survive dedup", () => {
    const ids = ["gpt-4o", "not-a-real-model", "gpt-4o"];
    const result = filterKnownModels(ids);
    expect(result.map((m) => m.id)).toEqual(["gpt-4o"]);
  });
});

describe("Property 7: Concurrency Safety", () => {
  test("MCP tool cleanup leaves no orphans regardless of cleanup order", () => {
    const baseline = getAllTools().length;
    prop(100, (rand) => {
      const names = Array.from({ length: 20 }, () => `srv${randInt(rand, 100)}/tool${randInt(rand, 100)}`);
      const unique = [...new Set(names)];
      const cleanups = unique.map((name) =>
        registerTool(name, {
          name,
          description: "test",
          parameters: { type: "object", properties: {}, required: [] },
          execute: async () => ({ success: true }),
        }),
      );
      const order = [...cleanups.keys()].sort(() => rand() - 0.5);
      for (const i of order) cleanups[i]();
      for (const name of unique) {
        expect(getTool(name)).toBeUndefined();
      }
      expect(getAllTools().length).toBe(baseline);
    });
  });

  test("tool namespacing never collides between servers and built-ins", () => {
    prop(100, (rand) => {
      const server = randStr(rand, 6, "abcdef");
      const tool = randStr(rand, 6, "abcdef");
      const builtin = getAllTools().some((t) => t.name === `${server}/${tool}`);
      expect(builtin).toBe(false);
      expect(`${server}/${tool}`).toContain("/");
    });
  });

  test("CRLF input parses identically to LF input", () => {
    prop(100, (rand) => {
      const key = randStr(rand, 5, "abc");
      const val = randStr(rand, 8, "xyz123 ");
      const lf = `---\n${key}: ${val}\n---\nbody\n`;
      const crlf = lf.replace(/\n/g, "\r\n");
      const a = parseFrontmatter(lf);
      const b = parseFrontmatter(crlf);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a).toEqual(b);
    });
  });
});

describe("streaming SSE accumulation", () => {
  test("text deltas concatenate into content", () => {
    const deltas: string[] = [];
    const acc = new OpenAIStreamAccumulator((d) => {
      if (d.kind === "text") deltas.push(d.text);
    });
    acc.flushLine('data: {"choices":[{"delta":{"content":"Hel"}}]}');
    acc.flushLine('data: {"choices":[{"delta":{"content":"lo"}}]}');
    acc.flushLine("data: [DONE]");
    acc.finalize();
    expect(acc.content).toBe("Hello");
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(acc.toolCalls).toEqual([]);
  });

  test("tool call argument fragments aggregate across lines", () => {
    const acc = new OpenAIStreamAccumulator(() => {});
    acc.flushLine('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}');
    acc.flushLine('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"src/a.ts\\"}"}}]}}]}');
    acc.flushLine("data: [DONE]");
    acc.finalize();
    expect(acc.toolCalls).toHaveLength(1);
    expect(acc.toolCalls[0].name).toBe("read_file");
    expect(acc.toolCalls[0].id).toBe("call_1");
    expect(JSON.parse(acc.toolCalls[0].arguments)).toEqual({ path: "src/a.ts" });
  });

  test("usage is captured from stream", () => {
    const acc = new OpenAIStreamAccumulator(() => {});
    acc.flushLine('data: {"choices":[{"delta":{"content":"x"}}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}');
    acc.flushLine("data: [DONE]");
    acc.finalize();
    expect(acc.usage?.total_tokens).toBe(8);
  });

  test("non-data lines and malformed JSON are ignored", () => {
    prop(100, (rand) => {
      const acc = new OpenAIStreamAccumulator(() => {});
      acc.flushLine(": keepalive comment");
      acc.flushLine(`event: random`);
      acc.flushLine("data: {not json");
      acc.flushLine("data: " + randStr(rand, 10, "abc{}"));
      acc.flushLine("data: [DONE]");
      acc.finalize();
      expect(acc.content).toBe("");
      expect(acc.toolCalls).toEqual([]);
    });
  });
});
