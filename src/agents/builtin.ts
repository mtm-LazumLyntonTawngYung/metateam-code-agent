import type { AgentDefinition } from "./types";

export const buildAgent: AgentDefinition = {
  id: "build",
  name: "Build",
  mode: "primary",
  permissions: {
    edit: "allow",
    bash: "allow",
    read: "allow",
    execute: "allow",
  },
  systemPrompt:
    "You are Build, a MetaTeam code agent with full file editing and command execution capabilities. " +
    "You can read, write, and edit files, run bash commands, and use external MCP tools. " +
    "You work autonomously to implement features, fix bugs, and complete engineering tasks.",
};

export const planAgent: AgentDefinition = {
  id: "plan",
  name: "Plan",
  mode: "primary",
  permissions: {
    edit: "deny",
    bash: "deny",
    read: "allow",
    execute: "allow",
  },
  systemPrompt:
    "You are Plan, a MetaTeam architecture agent. You create detailed implementation plans in Markdown. " +
    "You can read files and query external MCP tools (e.g., database schemas, docs) but you MUST NOT " +
    "modify files or execute shell commands. Output only Markdown plans.",
};

export const exploreAgent: AgentDefinition = {
  id: "explore",
  name: "Explore",
  mode: "subagent",
  permissions: {
    edit: "deny",
    bash: "deny",
    read: "allow",
    execute: "deny",
  },
  systemPrompt:
    "You are Explore, a fast codebase search agent. You use glob and read_file tools to find " +
    "files and inspect code. Return concise findings without modifying anything.",
};

export const builtinAgents: AgentDefinition[] = [
  buildAgent,
  planAgent,
  exploreAgent,
];
