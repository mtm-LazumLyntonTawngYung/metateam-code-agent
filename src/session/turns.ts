import { run, get, all } from "./db";

export type TurnRow = {
  id: number;
  session_id: string;
  model_id: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  duration_ms: number;
  tool_calls: number;
  created_at: string;
};

export function recordTurn(data: {
  sessionId: string;
  modelId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
  durationMs: number;
  toolCalls: number;
}): number {
  const result = run(
    `INSERT INTO turns (
      session_id, model_id, provider,
      input_tokens, output_tokens, reasoning_tokens,
      cache_read_tokens, cache_write_tokens,
      cost_usd, duration_ms, tool_calls
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.sessionId,
      data.modelId,
      data.provider,
      data.inputTokens,
      data.outputTokens,
      data.reasoningTokens ?? 0,
      data.cacheReadTokens ?? 0,
      data.cacheWriteTokens ?? 0,
      data.costUsd,
      data.durationMs,
      data.toolCalls,
    ],
  );
  return result.lastInsertRowid;
}

export function getSessionTurns(sessionId: string, limit = 50): TurnRow[] {
  return all<TurnRow>(
    "SELECT * FROM turns WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
    [sessionId, limit],
  );
}

export function getSessionTurnStats(sessionId: string): {
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalDuration: number;
} {
  const row = get<{
    total_turns: number;
    total_input: number;
    total_output: number;
    total_cost: number;
    total_duration: number;
  }>(
    `SELECT
      COUNT(*) as total_turns,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COALESCE(SUM(duration_ms), 0) as total_duration
    FROM turns WHERE session_id = ?`,
    [sessionId],
  );
  return {
    totalTurns: row?.total_turns ?? 0,
    totalInputTokens: row?.total_input ?? 0,
    totalOutputTokens: row?.total_output ?? 0,
    totalCost: row?.total_cost ?? 0,
    totalDuration: row?.total_duration ?? 0,
  };
}
