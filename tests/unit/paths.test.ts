import { describe, test, expect } from "bun:test";
import { join } from "path";
import { validateFilePath } from "../../src/utils/security";
import { isPathIgnored } from "../../src/secrets/ignore";
import { prop, randInt } from "./prop";

describe("Property 9: Cross-Platform Path Handling", () => {
  test("validateFilePath rejects traversal with both / and \\ separators", () => {
    prop(50, (rand) => {
      const depth = 1 + randInt(rand, 4);
      const traversal = "../".repeat(depth) + "secret.txt";
      expect(validateFilePath(join("repo", "src"), traversal)).toBe(false);
      expect(validateFilePath(join("repo", "src"), "..\\..\\secret.txt")).toBe(false);
      expect(validateFilePath(join("repo", "src"), "../../" + "a/b")).toBe(false);
    });
  });

  test("validateFilePath allows relative paths inside base with either separator", () => {
    prop(50, (rand) => {
      const dirs = ["a", "b", "deep"];
      const parts = Array.from(
        { length: 1 + randInt(rand, 3) },
        () => dirs[randInt(rand, dirs.length)],
      );
      const rel = parts.join("/");
      expect(validateFilePath(join("repo"), rel)).toBe(true);
      expect(validateFilePath(join("repo"), rel.replaceAll("/", "\\"))).toBe(true);
    });
  });

  test("isPathIgnored result is independent of path separator style", () => {
    prop(50, (rand) => {
      const segs = Array.from({ length: 2 + randInt(rand, 3) }, () =>
        randInt(rand, 2) === 0 ? "src" : "lib",
      );
      const fwd = segs.join("/") + "/index.ts";
      const back = fwd.replaceAll("/", "\\");
      expect(isPathIgnored(fwd)).toBe(isPathIgnored(back));
    });
  });
});
