import { redactText } from "../secrets/index";
import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const isDev = process.env.NODE_ENV === "development" || process.env.MTC_DEV === "true";
const logDir = join(homedir(), ".mtc", "logs");
const logFile = join(logDir, "dev.log");

if (isDev) {
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {}
}

function writeToFile(line: string): void {
  if (!isDev) return;
  try {
    appendFileSync(logFile, line + "\n");
  } catch {}
}

function log(level: LogLevel, message: string, ctx?: LogContext): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: redactText(message),
    ...redactContext(ctx),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  writeToFile(line);
}

function redactContext(ctx?: LogContext): LogContext {
  if (!ctx) return {};
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string") out[k] = redactText(v);
    else out[k] = v;
  }
  return out;
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
};

export function getDevLogPath(): string {
  return logFile;
}
