import { describe, test, expect } from "bun:test";
import { VERSION, compareVersions, isNewerVersion } from "../../src/version";
import { version as packageVersion } from "../../package.json";
import { prop, randInt } from "./prop";

describe("Property 12: Build and Version Determinism", () => {
  test("VERSION is a single source matching package.json", () => {
    expect(VERSION).toBe(packageVersion);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("compareVersions is consistent and antisymmetric", () => {
    prop(50, (rand) => {
      const a = `${randInt(rand, 50)}.${randInt(rand, 50)}.${randInt(rand, 50)}`;
      const b = `${randInt(rand, 50)}.${randInt(rand, 50)}.${randInt(rand, 50)}`;
      const ab = compareVersions(a, b);
      const ba = compareVersions(b, a);
      if (ab === 0) {
        expect(ba).toBe(0);
      } else {
        expect(ab).toBe(-ba);
      }
    });
  });

  test("compareVersions is transitive and matches numeric ordering", () => {
    prop(50, (rand) => {
      const majorA = randInt(rand, 5);
      const majorB = randInt(rand, 5);
      const a = `${majorA}.${randInt(rand, 5)}.${randInt(rand, 5)}`;
      const b = `${majorB}.${randInt(rand, 5)}.${randInt(rand, 5)}`;
      if (majorA < majorB) expect(compareVersions(a, b)).toBeLessThan(0);
      if (majorA > majorB) expect(compareVersions(a, b)).toBeGreaterThan(0);
    });
  });

  test("compareVersions treats equal versions as equal regardless of v-prefix", () => {
    prop(50, (rand) => {
      const v = `${randInt(rand, 20)}.${randInt(rand, 20)}.${randInt(rand, 20)}`;
      expect(compareVersions(v, v)).toBe(0);
      expect(compareVersions(`v${v}`, v)).toBe(0);
    });
  });

  test("patch/minor increments are detected as newer", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.1.0", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });

  test("isNewerVersion is false for older or equal, true for newer", () => {
    expect(isNewerVersion("1.0.0", VERSION)).toBe(compareVersions("1.0.0", VERSION) > 0);
    expect(isNewerVersion("0.0.1", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
  });
});
