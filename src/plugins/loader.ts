import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync, readdirSync } from "fs";
import type { Plugin, LoadedPlugin } from "./types";

const PROJECT_PLUGINS_DIR = join(process.cwd(), ".mtc", "plugins");
const GLOBAL_PLUGINS_DIR = join(homedir(), ".config", "mtc", "plugins");

const SUPPORTED_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs"]);

function scanDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => SUPPORTED_EXTENSIONS.has(join(f).slice(join(f).lastIndexOf("."))))
      .map((f) => join(dir, f))
      .filter((p) => existsSync(p));
  } catch {
    return [];
  }
}

export function discoverPluginFiles(): string[] {
  const files = scanDir(PROJECT_PLUGINS_DIR);
  const globalFiles = scanDir(GLOBAL_PLUGINS_DIR);
  for (const f of globalFiles) {
    if (!files.includes(f)) files.push(f);
  }
  return files.map((f) => resolve(f));
}

function toPluginName(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.(ts|js|mjs|cjs)$/, "");
}

export async function loadPluginFromFile(file: string): Promise<LoadedPlugin> {
  const mod = (await import(file)) as Record<string, unknown>;
  const candidate = mod.plugin ?? mod.default ?? mod.Plugin;
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Plugin file ${file} does not export a plugin object (export default or 'plugin').`);
  }
  const plugin = candidate as Plugin;
  return {
    plugin: {
      ...plugin,
      name: plugin.name ?? toPluginName(file),
    },
    source: file,
  };
}

export async function loadPluginsFromDisk(): Promise<LoadedPlugin[]> {
  const files = discoverPluginFiles();
  const loaded: LoadedPlugin[] = [];
  for (const file of files) {
    try {
      loaded.push(await loadPluginFromFile(file));
    } catch (err) {
      console.error(`Failed to load plugin ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return loaded;
}
