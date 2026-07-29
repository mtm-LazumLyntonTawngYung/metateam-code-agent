import { homedir } from "os";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export type MtcConfig = {
  apiKey?: string;
  endpoint?: string;
  selectedModel?: string;
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
