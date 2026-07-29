import { recordEvent, isTelemetryEnabled } from "./store";

let sessionId: string | null = null;

export function setSessionId(id: string): void {
  sessionId = id;
}

export function getSessionId(): string | null {
  return sessionId;
}

export function trackSessionStart(): void {
  if (!isTelemetryEnabled()) return;
  recordEvent("session", "session_start", { start: new Date().toISOString() }, sessionId ?? undefined);
}

export function trackSessionEnd(): void {
  if (!isTelemetryEnabled()) return;
  recordEvent("session", "session_end", { end: new Date().toISOString() }, sessionId ?? undefined);
}

export function trackToolCall(
  toolName: string,
  success: boolean,
  durationMs: number,
  errorMessage?: string,
): void {
  if (!isTelemetryEnabled()) return;
  recordEvent(
    "tool_call",
    `tool.${success ? "ok" : "fail"}.${toolName}`,
    {
      tool: toolName,
      success: String(success),
      duration: durationMs,
      error: errorMessage ?? null,
    },
    sessionId ?? undefined,
  );
}

export function trackModelUsage(model: string, tokens: number): void {
  if (!isTelemetryEnabled()) return;
  recordEvent(
    "model_usage",
    `model.${model}`,
    { model, tokens },
    sessionId ?? undefined,
  );
}

export function trackHeartbeat(): void {
  if (!isTelemetryEnabled()) return;
  recordEvent("heartbeat", "heartbeat.daily", { ts: new Date().toISOString() });
}
