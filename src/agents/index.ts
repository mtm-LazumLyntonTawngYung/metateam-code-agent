import type { AgentDefinition, AgentPermissions } from "./types";
import { builtinAgents } from "./builtin";
import { loadCustomAgents } from "./custom";
import { loadRules, getRules, reloadRules } from "./rules";

const toolCategoryMap: Record<string, string[]> = {
  edit: ["edit_file", "write_file"],
  bash: ["run_bash", "websearch"],
  read: ["read_file", "glob_files"],
};

let customAgents: AgentDefinition[] = [];
let activeAgent: AgentDefinition | null = null;
let cachedRules: string = "";

export function initAgents(): string {
  customAgents = loadCustomAgents();
  cachedRules = loadRules();
  const id = "build";
  activeAgent = builtinAgents.find((a) => a.id === id) ?? null;
  return id;
}

export function setActiveAgent(id: string): AgentDefinition | null {
  const agent = getAgentById(id);
  if (agent) activeAgent = agent;
  return agent;
}

export function getActiveAgent(): AgentDefinition | null {
  return activeAgent;
}

export function getEffectiveSystemPrompt(
  agent: AgentDefinition,
  skillBody?: string,
): string {
  const parts = [agent.systemPrompt];
  if (cachedRules) parts.push(cachedRules);
  if (skillBody) parts.push(skillBody);
  return parts.join("\n\n");
}

export function getAllAgents(): AgentDefinition[] {
  return [...builtinAgents, ...customAgents];
}

export function getPrimaryAgents(): AgentDefinition[] {
  return getAllAgents().filter((a) => a.mode === "primary");
}

export function getSubagents(): AgentDefinition[] {
  return getAllAgents().filter((a) => a.mode === "subagent");
}

export function getAgentById(id: string): AgentDefinition | null {
  return getAllAgents().find((a) => a.id === id) ?? null;
}

export function isToolDenied(
  toolName: string,
  agent: AgentDefinition,
): boolean {
  for (const [category, tools] of Object.entries(toolCategoryMap)) {
    if (tools.includes(toolName)) {
      const key = category as keyof AgentPermissions;
      return agent.permissions[key] === "deny";
    }
  }
  return agent.permissions.execute === "deny";
}

export { builtinAgents } from "./builtin";
export { loadCustomAgents } from "./custom";
export { runSubagent, runTaskSubagent, runParallelSubagents } from "./subagent";
export { runAgentLoop } from "./agent-loop";
export { loadRules, getRules, reloadRules } from "./rules";
export type {
  SubagentTask,
  SubagentResult,
  SubagentTaskOptions,
  ParallelSubagentOptions,
} from "./subagent";
export type { ToolCall, AgentUpdate } from "./agent-loop";
export type {
  AgentDefinition,
  AgentMode,
  AgentPermissions,
  PermissionLevel,
} from "./types";
