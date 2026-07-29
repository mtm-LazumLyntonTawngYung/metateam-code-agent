export type AgentMode = "primary" | "subagent";

export type PermissionLevel = "allow" | "deny";

export type AgentPermissions = {
  edit: PermissionLevel;
  bash: PermissionLevel;
  read: PermissionLevel;
  execute: PermissionLevel;
};

export type AgentDefinition = {
  id: string;
  name: string;
  mode: AgentMode;
  permissions: AgentPermissions;
  systemPrompt: string;
};

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  edit: "allow",
  bash: "allow",
  read: "allow",
  execute: "allow",
};

export type AgentChangeCallback = (agent: AgentDefinition) => void;
