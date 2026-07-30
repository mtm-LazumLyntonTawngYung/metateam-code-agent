import { homedir } from "os";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createHash, randomUUID } from "crypto";

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
  themeId?: string;
};

const configDir = join(homedir(), ".config", "mtc");
const configPath = join(configDir, "config.json");

function ensureDir(): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

export function loadConfig(): MtcConfig {
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw) as MtcConfig;
    }
  } catch {
    // corrupt file — return defaults
  }
  return {};
}

export function saveConfig(partial: Partial<MtcConfig>): MtcConfig {
  ensureDir();
  const current = loadConfig();
  const merged = { ...current, ...partial };
  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function generateDeviceId(): string {
  const user = process.env.USERNAME ?? process.env.USER ?? "unknown";
  const host = process.env.COMPUTERNAME ?? "unknown";
  const seed = `${homedir()}-${user}-${host}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
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
