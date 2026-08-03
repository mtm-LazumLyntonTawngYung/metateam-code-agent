import { describe, test, expect } from "bun:test";
import { toCSV, serializeExport, isScheduleDue } from "../../src/enterprise/exports";
import type { ExportTemplate } from "../../src/enterprise/exports";
import { prop, randInt, randStr } from "./prop";

function template(overrides: Partial<ExportTemplate> = {}): ExportTemplate {
  return {
    id: "t1",
    name: "daily audit",
    source: "audit",
    format: "csv",
    filters: "",
    schedule: "none",
    lastRunAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Export serialization and scheduling", () => {
  test("CSV rows are escaped and always produce one row per input", () => {
    prop(200, (rand) => {
      const cols = ["a", "b", "c"];
      const rows = [];
      const n = 1 + randInt(rand, 20);
      for (let i = 0; i < n; i++) {
        rows.push({
          a: randStr(rand, 5, 'abc,"x'),
          b: randInt(rand, 1000),
          c: `line\nbreak-${i}`,
        });
      }
      const csv = toCSV(rows, cols);
      const lines = csv.split("\r\n").filter((l) => l.length > 0);
      expect(lines.length).toBe(n + 1);
      expect(lines[0].split(",")).toEqual(cols);
      expect(csv).toContain('"');
    });
  });

  test("CSV escaping keeps the header column count stable", () => {
    prop(100, (rand) => {
      const cols = ["one", "two", "three"];
      const rows = [{ one: `a,"b`, two: "", three: null }];
      const csv = toCSV(rows, cols);
      const header = csv.split("\r\n")[0];
      expect(header.split(",").length).toBe(3);
    });
  });

  test("serializeExport returns correct content type and extension per format", () => {
    const data = [{ id: 1, name: "x" }];
    const csv = serializeExport(data, "csv");
    expect(csv.contentType).toContain("text/csv");
    expect(csv.extension).toBe("csv");
    const json = serializeExport(data, "json");
    expect(json.contentType).toContain("application/json");
    expect(json.extension).toBe("json");
    expect(() => JSON.parse(json.body)).not.toThrow();
  });

  test("empty data serializes to a bare header CSV", () => {
    const csv = serializeExport([], "csv", ["a", "b"]);
    expect(csv.body.split("\r\n")[0]).toBe("a,b");
  });

  test("scheduled exports are due only after their interval elapses", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    expect(isScheduleDue(template({ schedule: "none" }), now)).toBe(false);
    expect(isScheduleDue(template({ schedule: "daily", lastRunAt: null }), now)).toBe(true);
    expect(isScheduleDue(
      template({ schedule: "daily", lastRunAt: "2026-01-08T12:00:00Z" }),
      now,
    )).toBe(true);
    expect(isScheduleDue(
      template({ schedule: "daily", lastRunAt: "2026-01-09T23:59:00Z" }),
      now,
    )).toBe(false);
    expect(isScheduleDue(
      template({ schedule: "weekly", lastRunAt: "2026-01-03T00:00:00Z" }),
      now,
    )).toBe(true);
    expect(isScheduleDue(
      template({ schedule: "weekly", lastRunAt: "2026-01-09T00:00:00Z" }),
      now,
    )).toBe(false);
  });
});
