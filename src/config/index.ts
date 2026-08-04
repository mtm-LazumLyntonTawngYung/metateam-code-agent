import { homedir } from "os";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

export type TelemetryConfig = {
  enabled: boolean;
  endpoint?: string;
  deviceId: string;
};

export type MtcConfig = {
  apiKey?: string;
  endpoint?: string;
  selectedModel?: string;
  agentId?: string;
  installedSkills?: string[];
  telemetry?: TelemetryConfig;
  llm?: Record<string, unknown>;
  license?: Record<string, unknown>;
  auth?: { clientId?: string; tenantId?: string; clientSecret?: string };
  organization?: { name?: string };
  themeId?: string;
  webSearch?: { enabled?: boolean };
  permissions?: {
    rules?: Array<{ tool: string; action: "allow" | "ask" | "deny" }>;
    alwaysAllow?: string[];
  };
};

const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "mtc");
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, "config.json");
const PROJECT_CONFIG_DIR = ".mtc";
const PROJECT_CONFIG_PATH = join(PROJECT_CONFIG_DIR, "config.json");

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function readJsonSafe(path: string): MtcConfig | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as MtcConfig;
  } catch {
    return null;
  }
}

export function loadConfig(): MtcConfig {
  const globalCfg = readJsonSafe(GLOBAL_CONFIG_PATH) ?? {};
  const projectCfg = readJsonSafe(PROJECT_CONFIG_PATH) ?? {};
  return mergeConfigs(globalCfg, projectCfg);
}

export function saveConfig(partial: Partial<MtcConfig>): MtcConfig {
  ensureDir(GLOBAL_CONFIG_DIR);
  const current = loadConfig();
  const merged = { ...current, ...partial };
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function saveProjectConfig(partial: Partial<MtcConfig>): MtcConfig {
  ensureDir(PROJECT_CONFIG_DIR);
  const current = readJsonSafe(PROJECT_CONFIG_PATH) ?? {};
  const merged = { ...current, ...partial };
  writeFileSync(PROJECT_CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function loadGlobalConfig(): MtcConfig {
  return readJsonSafe(GLOBAL_CONFIG_PATH) ?? {};
}

export function loadProjectConfig(): MtcConfig {
  return readJsonSafe(PROJECT_CONFIG_PATH) ?? {};
}

function mergeConfigs(globalCfg: MtcConfig, projectCfg: MtcConfig): MtcConfig {
  const merged = { ...globalCfg, ...projectCfg };
  if (projectCfg.llm && globalCfg.llm) {
    merged.llm = deepMerge(globalCfg.llm, projectCfg.llm);
  } else if (projectCfg.llm) {
    merged.llm = projectCfg.llm;
  } else if (globalCfg.llm) {
    merged.llm = globalCfg.llm;
  }
  return merged;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function generateDeviceId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function ensureTelemetryConfig(): { enabled: boolean; deviceId: string } {
  const cfg = loadConfig();
  if (cfg.telemetry?.deviceId) {
    return { enabled: cfg.telemetry.enabled, deviceId: cfg.telemetry.deviceId };
  }
  const deviceId = generateDeviceId();
  const telemetry = { enabled: cfg.telemetry?.enabled ?? false, deviceId };
  saveConfig({ telemetry });
  return telemetry;
}
