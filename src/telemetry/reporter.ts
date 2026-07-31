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
