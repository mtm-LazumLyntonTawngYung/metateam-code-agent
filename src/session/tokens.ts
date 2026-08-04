import { findModel } from "../llm/config";

export type TokenBudget = {
  maxTokens: number;
  warnThreshold: number; // fraction 0-1, e.g. 0.8
};

export const DEFAULT_BUDGET: TokenBudget = {
  maxTokens: 128_000,
  warnThreshold: 0.8,
};

export function countTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x7f) {
      tokens += cp <= 0x20 || cp === 0x7f ? 0 : 0.25;
    } else if (cp >= 0x4e00 && cp <= 0x9fff) {
      tokens += 1;
    } else if (cp <= 0x7ff) {
      tokens += 0.5;
    } else {
      tokens += 0.35;
    }
  }
  return Math.max(1, Math.ceil(tokens));
}

export function countTokensForModel(
  text: string,
  modelId?: string,
): { tokens: number; budget: TokenBudget } {
  const budget = budgetForModel(modelId);
  return { tokens: countTokens(text), budget };
}

export function budgetForModel(modelId?: string): TokenBudget {
  if (!modelId) return DEFAULT_BUDGET;
  const model = findModel(modelId);
  if (!model) return DEFAULT_BUDGET;
  return {
    maxTokens: model.contextWindow,
    warnThreshold: 0.8,
  };
}

export type TokenUsage = {
  totalTokens: number;
  maxTokens: number;
  fraction: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
  prunableCount: number;
};

export function estimateContextUsage(
  tokenCounts: number[],
  budget: TokenBudget = DEFAULT_BUDGET,
): TokenUsage {
  const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
  const fraction = totalTokens / budget.maxTokens;
  return {
    totalTokens,
    maxTokens: budget.maxTokens,
    fraction,
    isNearLimit: fraction >= budget.warnThreshold,
    isOverLimit: fraction >= 1,
    prunableCount: computePrunableCount(tokenCounts, totalTokens, budget),
  };
}

function computePrunableCount(
  tokenCounts: number[],
  totalTokens: number,
  budget: TokenBudget,
): number {
  if (totalTokens < budget.maxTokens * budget.warnThreshold) return 0;
  const targetKeep = Math.floor(budget.maxTokens * budget.warnThreshold * 0.8);
  let sum = 0;
  let count = 0;
  for (let i = tokenCounts.length - 1; i >= 0; i--) {
    sum += tokenCounts[i];
    if (sum > targetKeep) return tokenCounts.length - 1 - i;
  }
  return Math.max(0, tokenCounts.length - 1);
}
