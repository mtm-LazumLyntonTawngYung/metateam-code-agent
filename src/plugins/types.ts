import type { ToolDefinition } from "../tools/schema";
import type { MtcConfig } from "../config";

export type PluginContext = {
  projectRoot: string;
  config: MtcConfig;
  registerTool: (tool: ToolDefinition) => () => void;
  log: (message: string) => void;
};

export type PluginHooks = {
  beforeTool?: (name: string, args: Record<string, unknown>) => void | Promise<void>;
  afterTool?: (name: string, result: unknown) => void | Promise<void>;
  onLoad?: () => void | Promise<void>;
  onDispose?: () => void | Promise<void>;
};

export type Plugin = {
  name: string;
  version?: string;
  description?: string;
  tools?: ToolDefinition[];
  setup?: (ctx: PluginContext) => void | Promise<void>;
  hooks?: PluginHooks;
};

export type LoadedPlugin = {
  plugin: Plugin;
  source: string;
};
