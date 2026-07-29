import { SECRET_PATTERNS, REDACTED_PLACEHOLDER } from "./patterns";
import type { ToolResult } from "../tools/schema";

export function redactText(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern.regex, pattern.replaceWith);
  }
  return result;
}

export function redactToolResult(result: ToolResult): ToolResult {
  const redacted: ToolResult = { ...result };

  if (typeof redacted.data === "string") {
    redacted.data = redactText(redacted.data);
  } else if (typeof redacted.data === "object" && redacted.data !== null) {
    redacted.data = deepRedact(redacted.data as Record<string, unknown>);
  }

  if (redacted.error) {
    redacted.error = redactText(redacted.error);
  }

  return redacted;
}

function deepRedact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = redactText(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = deepRedact(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function redactToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      redacted[key] = redactText(value);
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = deepRedact(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export { REDACTED_PLACEHOLDER };
