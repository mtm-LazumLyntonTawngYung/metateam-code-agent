import {
  queryDailyStats,
  queryModelStats,
  queryToolStats,
  queryActiveDevices,
  queryTotalTokens,
  queryRecentEvents,
} from "./store";

export type Report = {
  activeDevices: number;
  totalTokens: number;
  dailyStats: ReturnType<typeof queryDailyStats>;
  modelStats: ReturnType<typeof queryModelStats>;
  toolStats: ReturnType<typeof queryToolStats>;
  recentEvents: ReturnType<typeof queryRecentEvents>;
};

export function generateReport(days = 30): Report {
  return {
    activeDevices: queryActiveDevices(days),
    totalTokens: queryTotalTokens(days),
    dailyStats: queryDailyStats(days),
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
      console.log(
        `    ${t.tool_name.padEnd(22)} ${String(t.call_count).padStart(6)} calls${status.padStart(14)}  ${String(t.avg_duration_ms).padStart(6)}ms avg`,
      );
    }
  }

  if (report.dailyStats.length > 0) {
    console.log(`\n  Daily Activity:`);
    console.log(`    ${"Date".padEnd(14)} ${"Calls".padStart(6)} ${"Failures".padStart(9)} ${"Fail%".padStart(6)} ${"Sessions".padStart(9)}`);
    console.log(`    ${"-".repeat(46)}`);
    for (const d of report.dailyStats) {
      console.log(
        `    ${d.date.padEnd(14)} ${String(d.total_tool_calls).padStart(6)} ${String(d.tool_failures).padStart(9)} ${String(d.failure_rate).padStart(6)}% ${String(d.unique_sessions).padStart(9)}`,
      );
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
