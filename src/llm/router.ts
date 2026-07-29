import type { TaskComplexity, RoutingDecision } from "./types";
import { KNOWN_MODELS, DEFAULT_ROUTING } from "./types";
import { loadLlmConfig } from "./config";

const COMPLEX_PATTERNS = [
  /\b(refactor|restructure|redesign|rewrite)\b/i,
  /\b(architect|architecture|design pattern|component)\b/i,
  /\b(migrate|convert|transpile)\b/i,
  /\bmulti.?file\b/i,
  /\b(implement|build|create new)\b.+(feature|module|service|system)\b/i,
  /\b(split|extract|separate)\b.+(module|file|class|component)\b/i,
  /\b(performance|optimize|optimization|benchmark)\b/i,
  /\b(database|schema|migration|query)\b/i,
  /\b(security|auth|permission|encrypt)\b/i,
];

const SIMPLE_PATTERNS = [
  /\b(read|view|show|display|print|output)\b/i,
  /\b(typo|spelling|grammar|format)\b/i,
  /\b(regex|replace|find|search)\b/i,
  /\b(doc|document|comment|jsdoc)\b/i,
  /\b(rename|move|copy)\b.+(file|variable|function)\b/i,
  /\b(minor|small|quick|simple)\b/i,
  /\b(lint|fix|style|prettier|format)\b/i,
];

export function classifyTask(query: string, fileCount: number): TaskComplexity {
  if (fileCount > 3) return "complex";
  if (fileCount > 1) return "medium";

  let complexityScore = 0;
  let simpleScore = 0;

  for (const p of COMPLEX_PATTERNS) {
    if (p.test(query)) complexityScore++;
  }
  for (const p of SIMPLE_PATTERNS) {
    if (p.test(query)) simpleScore++;
  }

  const words = query.split(/\s+/).length;
  if (words > 100) complexityScore += 1;

  if (complexityScore > simpleScore && complexityScore >= 1) return "complex";
  if (simpleScore > complexityScore && simpleScore >= 1) return "simple";
  return "medium";
}

export function routeTask(query: string, fileCount: number): RoutingDecision {
  const complexity = classifyTask(query, fileCount);
  const cfg = loadLlmConfig();

  const modelIdMap: Record<TaskComplexity, string> = {
    simple: cfg.routing.simpleModel,
    medium: cfg.routing.defaultModel,
    complex: cfg.routing.reasoningModel,
  };

  const modelId = modelIdMap[complexity];
  const model = KNOWN_MODELS.find((m) => m.id === modelId);

  if (model) {
    return {
      model,
      complexity,
      reason: `Classified as ${complexity} task (${fileCount} files, ${query.split(/\s+/).length} words)`,
    };
  }

  const fallbackId = DEFAULT_ROUTING[complexity === "simple" ? "fast" : complexity === "complex" ? "reasoning" : "default"][0];
  const fallback = KNOWN_MODELS.find((m) => m.id === fallbackId)!;

  return {
    model: fallback,
    complexity,
    reason: `Model '${modelId}' not found, fell back to '${fallbackId}'`,
  };
}
