import { loadPluginsFromDisk } from "./loader";
import { registerTool } from "../tools/index";
import { loadConfig } from "../config";
import type { Plugin, PluginHooks, PluginContext } from "./types";
import type { LoadedPlugin } from "./types";

export type PluginManager = {
  loaded: LoadedPlugin[];
  hooks: { beforeTool: NonNullable<PluginHooks["beforeTool"]>[]; afterTool: NonNullable<PluginHooks["afterTool"]>[] };
  unregister: () => void;
};

let loadedPlugins: LoadedPlugin[] = [];
let hookFns: { beforeTool: NonNullable<PluginHooks["beforeTool"]>[]; afterTool: NonNullable<PluginHooks["afterTool"]>[] } = {
  beforeTool: [],
  afterTool: [],
};
let unapply: (() => void) | null = null;
let applied = false;

export function getLoadedPlugins(): LoadedPlugin[] {
  return loadedPlugins;
}

export async function loadPlugins(): Promise<LoadedPlugin[]> {
  loadedPlugins = await loadPluginsFromDisk();
  return loadedPlugins;
}

export function getManager(): PluginManager | null {
  return applied ? { loaded: loadedPlugins, hooks: hookFns, unregister: unapply ?? (() => {}) } : null;
}

function buildContext(source: string): PluginContext {
  return {
    projectRoot: process.cwd(),
    config: loadConfig(),
    registerTool: (tool) => registerTool(tool.name, tool),
    log: (message) => console.log(`[plugin:${source}] ${message}`),
  };
}

export async function applyPlugins(): Promise<PluginManager> {
  if (applied) return getManager()!;
  const plugins = loadedPlugins.length > 0 ? loadedPlugins : await loadPlugins();

  const unregisterFns: Array<() => void> = [];
  const beforeTool: NonNullable<PluginHooks["beforeTool"]>[] = [];
  const afterTool: NonNullable<PluginHooks["afterTool"]>[] = [];

  for (const loaded of plugins) {
    const { plugin, source } = loaded;
    try {
      for (const tool of plugin.tools ?? []) {
        if (!tool || !tool.name) continue;
        unregisterFns.push(registerTool(tool.name, tool));
      }
      if (plugin.setup) {
        await plugin.setup(buildContext(source));
      }
      if (plugin.hooks?.onLoad) {
        await plugin.hooks.onLoad();
      }
      if (plugin.hooks?.beforeTool) beforeTool.push(plugin.hooks.beforeTool);
      if (plugin.hooks?.afterTool) afterTool.push(plugin.hooks.afterTool);
    } catch (err) {
      console.error(`Failed to apply plugin ${plugin.name} (${source}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  hookFns = { beforeTool, afterTool };
  unapply = () => {
    for (const fn of unregisterFns) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    unregisterFns.length = 0;
    applied = false;
    unapply = null;
  };
  applied = true;

  return { loaded: plugins, hooks: hookFns, unregister: unapply };
}

export async function reloadPlugins(): Promise<PluginManager> {
  if (applied && unapply) unapply();
  applied = false;
  loadedPlugins = [];
  return applyPlugins();
}

async function hooksOf(): Promise<PluginManager["hooks"]> {
  if (!applied) await applyPlugins();
  return hookFns;
}

export async function runBeforeToolHooks(name: string, args: Record<string, unknown>): Promise<void> {
  const hooks = await hooksOf();
  for (const hook of hooks.beforeTool) {
    try {
      await hook(name, args);
    } catch {
      /* plugin hook errors must never break tool execution */
    }
  }
}

export async function runAfterToolHooks(name: string, result: unknown): Promise<void> {
  const hooks = await hooksOf();
  for (const hook of hooks.afterTool) {
    try {
      await hook(name, result);
    } catch {
      /* plugin hook errors must never break tool execution */
    }
  }
}

export type { Plugin, PluginHooks, PluginContext, LoadedPlugin } from "./types";