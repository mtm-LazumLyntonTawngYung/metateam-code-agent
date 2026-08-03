import {
  queryDailyStats,
  queryModelStats,
  queryToolStats,
  queryActiveDevices,
  queryTotalTokens,
  queryRecentEvents,
} from "./store";
import type { ModelStats, ToolStats, DailyStats } from "./store";

export type ModelPricing = Record<string, number>;

export const MODEL_PRICING: ModelPricing = {
  "deepseek-chat": 0.55,
  "deepseek-reasoner": 1.2,
  "gpt-4o": 5,
  "gpt-4o-mini": 0.35,
  "claude-sonnet-4-20250514": 8,
  "claude-haiku-3-5-20241022": 1.5,
  "claude-3-5-haiku-20241022": 1.5,
  "google/gemini-2.0-flash-001": 0.4,
  "anthropic/claude-sonnet-4": 8,
  "anthropic/claude-3.5-haiku": 1.5,
  "openai/gpt-4o": 5,
  "openai/gpt-4o-mini": 0.35,
  "deepseek/deepseek-chat": 0.55,
};

export const DEFAULT_PRICE_PER_1M = 2;

export function priceForModel(model: string, pricing: ModelPricing = MODEL_PRICING): number {
  return pricing[model] ?? DEFAULT_PRICE_PER_1M;
}

export function estimateCosts(modelStats: ModelStats[], pricing: ModelPricing = MODEL_PRICING): {
  perModel: Array<{ model: string; tokens: number; cost: number }>;
  totalCost: number;
} {
  const perModel = modelStats.map((m) => {
    const tokens = m.total_tokens ?? 0;
    return { model: m.model, tokens, cost: (tokens / 1_000_000) * priceForModel(m.model, pricing) };
  });
  const totalCost = perModel.reduce((sum, m) => sum + m.cost, 0);
  return { perModel, totalCost };
}

export function buildOptimizationRecommendations(
  modelStats: ModelStats[],
  toolStats: ToolStats[],
): string[] {
  const recommendations: string[] = [];
  const totalTokens = modelStats.reduce((sum, m) => sum + (m.total_tokens ?? 0), 0);
  if (totalTokens <= 0) return recommendations;

  const pricey = modelStats
    .map((m) => ({ model: m.model, tokens: m.total_tokens ?? 0, price: priceForModel(m.model) }))
    .filter((m) => m.tokens > 0 && m.price >= 5)
    .sort((a, b) => b.tokens - a.tokens);
  if (pricey.length > 0) {
    const top = pricey[0];
    const share = Math.round((top.tokens / totalTokens) * 100);
    recommendations.push(
      `${top.model} accounts for ${share}% of tokens at ~$${top.price}/1M tokens. ` +
        `Consider routing simple tasks to a cheaper model (e.g. gpt-4o-mini or deepseek-chat).`,
    );
  }

  const failing = toolStats
    .filter((t) => t.failure_rate > 20 && t.call_count >= 3)
    .sort((a, b) => b.failure_rate - a.failure_rate);
  if (failing.length > 0) {
    const worst = failing[0];
    recommendations.push(
      `${worst.tool_name} has a ${worst.failure_rate}% failure rate across ${worst.call_count} calls. ` +
        `Review its error handling or arguments to reduce wasted retries.`,
    );
  }

  if (modelStats.length > 3) {
    const heavy = modelStats
      .slice()
      .sort((a, b) => (b.total_tokens ?? 0) - (a.total_tokens ?? 0))[0];
    if (heavy && (heavy.total_tokens ?? 0) / totalTokens > 0.6) {
      recommendations.push(
        `Model usage is concentrated on ${heavy.model} (${Math.round((heavy.total_tokens! / totalTokens) * 100)}%). ` +
          `Consolidate providers to negotiate better rates or enable caching.`,
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("Usage looks healthy. No immediate optimization needed.");
  }
  return recommendations;
}

export function movingAverage(series: number[], window: number): number[] {
  if (series.length === 0) return [];
  const w = Math.max(1, Math.min(window, series.length));
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i];
    if (i >= w) sum -= series[i - w];
    out.push(round1(sum / Math.min(i + 1, w)));
  }
  return out;
}

export function forecastSeries(series: number[], horizon: number): number[] {
  if (series.length === 0) return [];
  const n = series.length;
  if (n === 1) return new Array(horizon).fill(round1(series[0]));

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += series[i];
    sumXY += i * series[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = denom === 0 ? sumY / n : (sumY - slope * sumX) / n;

  const forecast: number[] = [];
  for (let i = 1; i <= horizon; i++) {
    forecast.push(round1(Math.max(0, intercept + slope * (n - 1 + i))));
  }
  return forecast;
}

export type PeriodComparison = {
  currentTotal: number;
  previousTotal: number;
  delta: number;
  deltaPct: number;
};

export function comparePeriods(series: number[], splitAt: number): PeriodComparison {
  const current = series.slice(splitAt);
  const previous = series.slice(0, splitAt);
  const currentTotal = current.reduce((a, b) => a + b, 0);
  const previousTotal = previous.reduce((a, b) => a + b, 0);
  const delta = currentTotal - previousTotal;
  const deltaPct = previousTotal > 0 ? round1((delta / previousTotal) * 100) : 0;
  return { currentTotal, previousTotal, delta, deltaPct };
}

export function computeTrends(
  dailyStats: DailyStats[],
  tokenSeries: number[] = [],
): {
  dates: string[];
  calls: number[];
  tokens: number[];
  movingAvg: number[];
  forecast: number[];
  comparison: PeriodComparison;
} {
  const dates = dailyStats.map((d) => d.date);
  const calls = dailyStats.map((d) => d.total_tool_calls ?? 0);
  const tokens = tokenSeries.length === dailyStats.length ? tokenSeries : calls;

  const movingAvg = movingAverage(calls, 7);
  const forecast = forecastSeries(calls, 7);
  const mid = Math.max(1, Math.floor(dailyStats.length / 2));
  const comparison = comparePeriods(calls, mid);
  return { dates, calls, tokens, movingAvg, forecast, comparison };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type Report = {
  activeDevices: number;
  totalTokens: number;
  totalSessions: number;
  totalToolCalls: number;
  dailyStats: ReturnType<typeof queryDailyStats>;
  modelStats: ReturnType<typeof queryModelStats>;
  toolStats: ReturnType<typeof queryToolStats>;
  recentEvents: ReturnType<typeof queryRecentEvents>;
};

export function generateReport(days = 30): Report {
  const dailyStats = queryDailyStats(days);
  const totalSessions = dailyStats.reduce((sum, d) => sum + (d.unique_sessions ?? 0), 0);
  const totalToolCalls = dailyStats.reduce((sum, d) => sum + (d.total_tool_calls ?? 0), 0);
  return {
    activeDevices: queryActiveDevices(days),
    totalTokens: queryTotalTokens(days),
    totalSessions,
    totalToolCalls,
    dailyStats,
    modelStats: queryModelStats(days),
    toolStats: queryToolStats(days),
    recentEvents: queryRecentEvents(20),
  };
}

export function printReport(report: Report, days: number): void {
  console.log(`\n  Analytics Report (last ${days} days)`);
  console.log(`  ${"=".repeat(50)}`);

  console.log(`\n  Active Developers:    ${report.activeDevices}`);
  console.log(`  Total Tokens Spent:  ${report.totalTokens.toLocaleString()}`);

  if (report.modelStats.length > 0) {
    console.log(`\n  Models Used:`);
    for (const m of report.modelStats) {
      const pct = report.totalTokens > 0
        ? ` (${((m.total_tokens / report.totalTokens) * 100).toFixed(1)}%)`
        : "";
      console.log(`    ${m.model.padEnd(30)} ${m.call_count} calls, ${m.total_tokens.toLocaleString()} tokens${pct}`);
    }
  }

  if (report.toolStats.length > 0) {
    console.log(`\n  Tool Usage:`);
    for (const t of report.toolStats) {
      const status = t.failure_rate > 0 ? `  ${t.failure_rate}% fail` : "  0% fail";
      const name = t.tool_name.padEnd(22);
      const calls = String(t.call_count).padStart(6);
      const avg = String(t.avg_duration_ms).padStart(6);
      console.log(`    ${name} ${calls} calls${status.padStart(14)}  ${avg}ms avg`);
    }
  }

  if (report.dailyStats.length > 0) {
    console.log(`\n  Daily Activity:`);
    const hdr = `    ${"Date".padEnd(14)} ${"Calls".padStart(6)} ${"Failures".padStart(9)} ${"Fail%".padStart(6)} ${"Sessions".padStart(9)}`;
    console.log(hdr);
    console.log(`    ${"-".repeat(46)}`);
    for (const d of report.dailyStats) {
      const date = d.date.padEnd(14);
      const calls = String(d.total_tool_calls).padStart(6);
      const fails = String(d.tool_failures).padStart(9);
      const rate = String(d.failure_rate).padStart(6);
      const sess = String(d.unique_sessions).padStart(9);
      console.log(`    ${date} ${calls} ${fails} ${rate}% ${sess}`);
    }
  }

  if (report.recentEvents.length > 0) {
    console.log(`\n  Recent Events (last ${Math.min(20, report.recentEvents.length)}):`);
    for (const e of report.recentEvents) {
      console.log(`    [${e.created_at}] ${e.event_type}: ${e.event_name}`);
    }
  }

  console.log();
}
