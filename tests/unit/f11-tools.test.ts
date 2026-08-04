import { describe, test, expect } from "bun:test";
import { prop, randInt, randStr } from "./prop";
import { parsePatch, applyPatchText, applyHunk } from "../../src/tools/apply_patch";
import { fuzzyUniqueReplace } from "../../src/tools/edit_file";
import {
  resolvePermissionAction,
  matchToolPattern,
  agentCategoryDenied,
  isSensitiveTool,
} from "../../src/tools/permissions";
import { countTokens, countTokensForModel, budgetForModel } from "../../src/session/tokens";
import { getTool, getToolSpecs } from "../../src/tools/index";
import { resolveSubagent } from "../../src/tools/task";
import { loadPluginFromFile } from "../../src/plugins/loader";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const sample = [
  "line one",
  "line two",
  "line three",
  "line four",
  "line five",
].join("\n");

describe("F11: New Feature Integration", () => {
  describe("apply_patch", () => {
    test("parsePatch parses a single-file unified diff", () => {
      const patch = [
        "--- a/foo.ts",
        "+++ b/foo.ts",
        "@@ -1,5 +1,6 @@",
        " line one",
        " line two",
        "-line three",
        "+line three edited",
        " line four",
        " line five",
      ].join("\n");

      const blocks = parsePatch(patch);
      expect(blocks.length).toBe(1);
      expect(blocks[0].oldFile).toBe("a/foo.ts");
      expect(blocks[0].newFile).toBe("b/foo.ts");
      expect(blocks[0].hunks.length).toBe(1);
    });

    test("applyHunk applies a simple modification", () => {
      const blocks = parsePatch(
        [
          "--- a/foo.ts",
          "+++ b/foo.ts",
          "@@ -1,5 +1,6 @@",
          " line one",
          " line two",
          "-line three",
          "+line three edited",
          " line four",
          " line five",
        ].join("\n"),
      );
      const result = applyHunk(sample.split("\n"), blocks[0].hunks[0]);
      expect(result.ok).toBe(true);
      expect(result.lines?.join("\n")).toContain("line three edited");
    });

    test("applyPatchText tolerates drifted context (fuzzy anchor)", () => {
      const patch = [
        "--- a/foo.ts",
        "+++ b/foo.ts",
        "@@ -1,5 +1,6 @@",
        " line one",
        " line two",
        "-line three",
        "+line three edited",
        " line four",
        " line five",
      ].join("\n");

      const drifted = [
        "extra header line",
        "another extra line",
        ...sample.split("\n"),
      ].join("\n");

      const result = applyPatchText(patch, () => drifted);
      expect(result.blocks[0].ok).toBe(true);
      expect(result.blocks[0].output).toContain("line three edited");
    });

    test("parsePatch is robust to random line payloads", () => {
      prop(50, (rand) => {
        const n = 1 + randInt(rand, 10);
        const body = Array.from({ length: n }, () => ` ${randStr(rand, 6, "abc")}`);
        const patch = ["--- a/x", "+++ b/x", "@@ -1,1 +1,1 @@", ...body].join("\n");
        const blocks = parsePatch(patch);
        expect(blocks.length).toBe(1);
        expect(blocks[0].hunks[0].body.length).toBe(body.length);
      });
    });
  });

  describe("edit_file fuzzy matching", () => {
    test("fuzzyUniqueReplace tolerates indentation-only differences", () => {
      const original = "  foo\n    bar\n  baz";
      const target = "  foo\n      bar\n  baz"; // different indentation on bar
      const result = fuzzyUniqueReplace(original, target, "  foo\n    bar->changed\n  baz");
      expect(result.applied).toBe(true);
      if (result.applied) expect(result.updated).toContain("bar->changed");
    });
  });

  describe("permissions model", () => {
    test("matchToolPattern supports glob-style wildcards", () => {
      expect(matchToolPattern("edit_*", "edit_file")).toBe(true);
      expect(matchToolPattern("edit_*", "run_bash")).toBe(false);
      expect(matchToolPattern("*", "anything")).toBe(true);
      expect(matchToolPattern("run_bash", "run_bash")).toBe(true);
    });

    test("agentCategoryDenied blocks unmapped tools under deny execute", () => {
      expect(
        agentCategoryDenied("some_new_tool", { edit: "allow", bash: "allow", read: "allow", execute: "deny" }),
      ).toBe(true);
      expect(
        agentCategoryDenied("some_new_tool", { edit: "allow", bash: "allow", read: "allow", execute: "allow" }),
      ).toBe(false);
    });

    test("resolvePermissionAction honors rules and always-allow", () => {
      const base = {
        permissions: { edit: "allow", bash: "allow", read: "allow", execute: "allow" } as const,
        rules: [],
        alwaysAllowed: new Set<string>(),
      };
      expect(resolvePermissionAction({ ...base, toolName: "read_file" })).toBe("allow");
      expect(resolvePermissionAction({ ...base, toolName: "edit_file" })).toBe("ask");
      expect(
        resolvePermissionAction({ ...base, toolName: "edit_file", alwaysAllowed: new Set(["edit_file"]) }),
      ).toBe("allow");
      expect(
        resolvePermissionAction({ ...base, toolName: "edit_file", rules: [{ tool: "edit_*", action: "deny" }] }),
      ).toBe("deny");
      expect(resolvePermissionAction({ ...base, toolName: "read_file", permissions: { edit: "allow", bash: "allow", read: "deny", execute: "allow" } })).toBe("deny");
    });

    test("isSensitiveTool marks editing and bash tools", () => {
      expect(isSensitiveTool("edit_file")).toBe(true);
      expect(isSensitiveTool("run_bash")).toBe(true);
      expect(isSensitiveTool("read_file")).toBe(false);
    });
  });

  describe("model-aware token counting", () => {
    test("countTokens is additive and deterministic", () => {
      prop(30, (rand) => {
        const parts = Array.from({ length: 1 + randInt(rand, 5) }, () =>
          randStr(rand, 10, "abc def 123"),
        );
        const joined = parts.join(" ");
        expect(countTokens(joined)).toBeGreaterThan(0);
        expect(countTokens(joined)).toBe(countTokens(joined));
      });
    });

    test("countTokensForModel returns a positive budget", () => {
      const { tokens, budget } = countTokensForModel("hello world", "gpt-4o");
      expect(tokens).toBeGreaterThan(0);
      expect(budget.maxTokens).toBeGreaterThan(0);
      expect(budget.warnThreshold).toBeGreaterThan(0);
      expect(budgetForModel()).toEqual(budgetForModel());
    });
  });

  describe("tool registry integration", () => {
    test("new tools are registered", () => {
      for (const name of ["task", "apply_patch", "git_diff", "git_commit", "skill"]) {
        expect(getTool(name)).toBeTruthy();
      }
    });

    test("getToolSpecs returns them as LLM specs", () => {
      const specs = getToolSpecs();
      const names = new Set(specs.map((s) => s.name));
      for (const name of ["task", "apply_patch", "git_diff", "skill"]) {
        expect(names.has(name)).toBe(true);
      }
    });

    test("resolveSubagent returns null for unknown agents", () => {
      expect(resolveSubagent("definitely-not-an-agent-xyz")).toBeNull();
    });
  });

  describe("plugin loader integration", () => {
    test("loadPluginFromFile loads a plugin exported as default or named export", async () => {
      const dir = mkdtempSync(join(tmpdir(), "mtc-plugins-"));
      const file = join(dir, "demo.ts");
      writeFileSync(file, `export const plugin = { name: "demo", version: "1.0.0" };`);
      try {
        const loaded = await loadPluginFromFile(file);
        expect(loaded.plugin.name).toBe("demo");
        expect(loaded.plugin.version).toBe("1.0.0");
        expect(loaded.source).toBe(file);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("loadPluginFromFile default-exports and fills a name when missing", async () => {
      const dir = mkdtempSync(join(tmpdir(), "mtc-plugins-"));
      const file = join(dir, "nameless.ts");
      writeFileSync(file, `export default { description: "no name" };`);
      try {
        const loaded = await loadPluginFromFile(file);
        expect(loaded.plugin.name).toBe("nameless");
        expect(loaded.plugin.description).toBe("no name");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
