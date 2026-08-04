import { run, all, get } from "./db";
import { getMessages, addMessage, type MessageRow } from "./history";
import { countTokens, estimateContextUsage, DEFAULT_BUDGET } from "./tokens";
import { redactText } from "../secrets/index";
import { findModel } from "../llm/config";

export type SummaryRow = {
  id: number;
  session_id: string;
  summary_text: string;
  pruned_until: number | null;
  token_count: number;
  created_at: string;
};

export function getSummaries(sessionId: string): SummaryRow[] {
  return all<SummaryRow>(
    "SELECT * FROM summaries WHERE session_id = ? ORDER BY created_at ASC",
    [sessionId],
  );
}

export function storeSummary(
  sessionId: string,
  summaryText: string,
  prunedUntil: number | null,
): number {
  const tokens = countTokens(summaryText);
  const result = run(
    "INSERT INTO summaries (session_id, summary_text, pruned_until, token_count) VALUES (?, ?, ?, ?)",
    [sessionId, summaryText, prunedUntil, tokens],
  );
  return result.lastInsertRowid;
}

export function getLatestSummary(sessionId: string): SummaryRow | null {
  return get<SummaryRow>(
    "SELECT * FROM summaries WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    [sessionId],
  );
}

export function buildContext(
  sessionId: string,
  systemPrompt?: string,
  modelId?: string,
): {
  systemMessages: string[];
  messages: MessageRow[];
  usage: ReturnType<typeof estimateContextUsage>;
} {
  const summaries = getSummaries(sessionId);
  const messages = getMessages(sessionId, false);
  const allTokenCounts = messages.map((m) => m.token_count);
  const budget = contextBudgetFor(modelId);
  const usage = estimateContextUsage(allTokenCounts, budget);

  const systemMessages: string[] = [];
  if (systemPrompt) systemMessages.push(redactText(systemPrompt));
  if (summaries.length > 0) {
    const latest = summaries[summaries.length - 1];
    systemMessages.push(
      `[Previous conversation summary]: ${latest.summary_text}`,
    );
  }

  return { systemMessages, messages, usage };
}

export function rotateContext(
  sessionId: string,
  messages: MessageRow[],
  modelId?: string,
): { pruned: number; summary: string } {
  const budget = contextBudgetFor(modelId);
  const usage = estimateContextUsage(
    messages.map((m) => m.token_count),
    budget,
  );

  if (!usage.isNearLimit) return { pruned: 0, summary: "" };

  const keepCount = Math.max(1, messages.length - usage.prunableCount);
  const prunedMessages = messages.slice(0, messages.length - keepCount);

  if (prunedMessages.length === 0) return { pruned: 0, summary: "" };

  const rawSummary = prunedMessages
    .map((m) => {
      if (m.role === "tool") {
        const toolName = m.tool_name ?? "tool";
        const result = m.tool_result ?? m.content;
        return `[${m.role}/${toolName}]: ${truncate(result, 200)}`;
      }
      return `[${m.role}]: ${truncate(m.content, 200)}`;
    })
    .join("\n");
  const summaryText = redactText(rawSummary);

  const lastPrunedId = prunedMessages[prunedMessages.length - 1].id;

  storeSummary(sessionId, summaryText, lastPrunedId);

  const ids = prunedMessages.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  run(`UPDATE messages SET pruned = 1 WHERE id IN (${placeholders})`, ids);

  addMessage(
    sessionId,
    "system",
    `[Context pruned: summarized ${prunedMessages.length} previous messages. See summaries table for full text.]`,
  );

  return { pruned: prunedMessages.length, summary: summaryText };
}

export function rotateIfNeeded(sessionId: string, modelId?: string): {
  rotated: boolean;
  pruned: number;
} {
  const messages = getMessages(sessionId, false);
  if (messages.length === 0) return { rotated: false, pruned: 0 };
  const result = rotateContext(sessionId, messages, modelId);
  return { rotated: result.pruned > 0, pruned: result.pruned };
}

function contextBudgetFor(modelId?: string): typeof DEFAULT_BUDGET {
  if (!modelId) return DEFAULT_BUDGET;
  const model = findModel(modelId);
  if (!model) return DEFAULT_BUDGET;
  const ctx = model.contextWindow;
  return {
    maxTokens: ctx,
    warnThreshold: 0.8,
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}
