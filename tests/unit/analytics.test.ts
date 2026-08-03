import { describe, test, expect } from "bun:test";
import {
  estimateCosts,
  buildOptimizationRecommendations,
  movingAverage,
  forecastSeries,
  comparePeriods,
  computeTrends,
  priceForModel,
  DEFAULT_PRICE_PER_1M,
} from "../../src/telemetry/reporter";
import { prop, randInt, randStr } from "./prop";

function randomModelStats(rand: () => number, count: number) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      model: `m${randStr(rand, 1 + randInt(rand, 6), "abc012")}`,
      call_count: randInt(rand, 100),
      total_tokens: randInt(rand, 1_000_000),
    });
  }
  return out;
}

describe("Property 15: Analytics Data Integrity", () => {
  test("cost estimation is non-negative, additive, and monotonic", () => {
    prop(200, (rand) => {
      const stats = randomModelStats(rand, 1 + randInt(rand, 6));
      const { perModel, totalCost } = estimateCosts(stats);

      for (const m of perModel) {
        expect(m.cost).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(m.cost)).toBe(true);
      }
      expect(totalCost).toBeGreaterThanOrEqual(0);

      const sum = perModel.reduce((a, b) => a + b.cost, 0);
      expect(Math.abs(sum - totalCost)).toBeLessThan(1e-9);

      const scaled = estimateCosts(stats.map((m) => ({ ...m, total_tokens: m.total_tokens * 2 })));
      expect(Math.abs(scaled.totalCost - 2 * totalCost)).toBeLessThan(1e-9);
    });
  });

  test("cost is proportional to price and falls back to the default price for unknown models", () => {
    prop(100, (rand) => {
      const tokens = randInt(rand, 1_000_000);
      const known = priceForModel("gpt-4o");
      expect(known).toBeGreaterThan(0);
      expect((tokens / 1_000_000) * known).toBeCloseTo(estimateCosts([{ model: "gpt-4o", call_count: 1, total_tokens: tokens }]).totalCost, 6);

      const unknown = `unknown-${randStr(rand, 6, "abc")}`;
      const est = estimateCosts([{ model: unknown, call_count: 1, total_tokens: tokens }]);
      expect(est.totalCost).toBeCloseTo((tokens / 1_000_000) * DEFAULT_PRICE_PER_1M, 6);
    });
  });

  test("optimization recommendations never throw and scale with inputs", () => {
    prop(200, (rand) => {
      const models = randomModelStats(rand, 1 + randInt(rand, 6));
      const tools = models.map((_, i) => ({
        tool_name: `tool_${i}`,
        call_count: randInt(rand, 50),
        failure_count: randInt(rand, 20),
        failure_rate: Math.round(rand() * 1000) / 10,
        avg_duration_ms: randInt(rand, 5000),
      }));
      expect(() => buildOptimizationRecommendations(models, tools)).not.toThrow();
      const recs = buildOptimizationRecommendations(models, tools);
      expect(Array.isArray(recs)).toBe(true);
      for (const r of recs) expect(typeof r).toBe("string");
    });
  });

  test("no usage yields an empty recommendation set", () => {
    const recs = buildOptimizationRecommendations([], []);
    expect(recs).toEqual([]);
  });

  test("moving average preserves length and stays within bounds", () => {
    prop(200, (rand) => {
      const n = 1 + randInt(rand, 40);
      const series = [];
      for (let i = 0; i < n; i++) series.push(randInt(rand, 1000));
      const w = 1 + randInt(rand, 10);
      const avg = movingAverage(series, w);
      expect(avg.length).toBe(series.length);
      const max = Math.max(...series, 0);
      for (const v of avg) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(max);
      }
    });
  });

  test("moving average of a constant series is that constant", () => {
    prop(100, (rand) => {
      const n = 1 + randInt(rand, 30);
      const c = randInt(rand, 500);
      const avg = movingAverage(new Array(n).fill(c), 7);
      for (const v of avg) expect(v).toBeCloseTo(c, 5);
    });
  });

  test("forecast matches the horizon and is non-negative", () => {
    prop(200, (rand) => {
      const n = 1 + randInt(rand, 30);
      const series = [];
      for (let i = 0; i < n; i++) series.push(randInt(rand, 1000));
      const horizon = 1 + randInt(rand, 14);
      const f = forecastSeries(series, horizon);
      expect(f.length).toBe(horizon);
      for (const v of f) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test("forecast of a constant series stays constant", () => {
    prop(100, (rand) => {
      const n = 5 + randInt(rand, 10);
      const c = randInt(rand, 300);
      const f = forecastSeries(new Array(n).fill(c), 7);
      for (const v of f) expect(v).toBeCloseTo(c, 4);
    });
  });

  test("forecast of a strictly increasing series is non-decreasing", () => {
    const series = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const f = forecastSeries(series, 5);
    for (let i = 1; i < f.length; i++) {
      expect(f[i]).toBeGreaterThanOrEqual(f[i - 1]);
    }
  });

  test("period comparison is internally consistent", () => {
    prop(200, (rand) => {
      const n = 2 + randInt(rand, 30);
      const series = [];
      for (let i = 0; i < n; i++) series.push(randInt(rand, 1000));
      const splitAt = Math.max(1, Math.floor(n / 2));
      const cmp = comparePeriods(series, splitAt);
      expect(cmp.currentTotal).toBe(series.slice(splitAt).reduce((a, b) => a + b, 0));
      expect(cmp.previousTotal).toBe(series.slice(0, splitAt).reduce((a, b) => a + b, 0));
      expect(cmp.delta).toBe(cmp.currentTotal - cmp.previousTotal);
      if (cmp.previousTotal === 0) {
        expect(cmp.deltaPct).toBe(0);
      } else {
        expect(Math.abs(cmp.deltaPct - (cmp.delta / cmp.previousTotal) * 100)).toBeLessThan(0.1);
      }
    });
  });

  test("trend aggregation keeps all series aligned", () => {
    prop(100, (rand) => {
      const n = 1 + randInt(rand, 30);
      const daily = [];
      for (let i = 0; i < n; i++) {
        daily.push({
          date: `2026-01-${String(i + 1).padStart(2, "0")}`,
          total_tool_calls: randInt(rand, 500),
          tool_failures: randInt(rand, 50),
          failure_rate: Math.round(rand() * 1000) / 10,
          unique_sessions: randInt(rand, 20),
          models_used: "m0,m1",
        });
      }
      const tokens = daily.map(() => randInt(rand, 1_000_000));
      const trends = computeTrends(daily, tokens);
      expect(trends.dates.length).toBe(n);
      expect(trends.calls.length).toBe(n);
      expect(trends.tokens.length).toBe(n);
      expect(trends.movingAvg.length).toBe(n);
      expect(trends.forecast.length).toBe(7);
      for (const v of trends.calls.concat(trends.tokens, trends.movingAvg, trends.forecast)) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
