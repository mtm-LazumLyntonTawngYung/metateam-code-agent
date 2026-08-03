import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import { parseFrontmatter } from "./frontmatter";
import type { AgentDefinition, AgentMode, AgentPermissions } from "./types";

const PROJECT_AGENTS_DIR = join(process.cwd(), ".mtc", "agents");
const GLOBAL_AGENTS_DIR = join(homedir(), ".config", "mtc", "agents");

const DEFAULT_PERMS: AgentPermissions = {
  read: "allow",
  edit: "deny",
  bash: "deny",
  execute: "deny",
};

function loadAgentFile(filePath: string): AgentDefinition | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseFrontmatter(content);
    if (!parsed) return null;

    const { frontmatter, body } = parsed;

    const name = String(frontmatter.name ?? "");
    if (!name) return null;

    const mode: AgentMode =
      String(frontmatter.mode ?? "subagent") === "primary"
        ? "primary"
        : "subagent";

    const permsRaw = frontmatter.permissions as
      | Record<string, string>
      | undefined;
    const permissions: AgentPermissions = { ...DEFAULT_PERMS };
    if (permsRaw) {
      permissions.read = permsRaw.read === "allow" ? "allow" : "deny";
      permissions.edit = permsRaw.edit === "allow" ? "allow" : "deny";
      permissions.bash = permsRaw.bash === "allow" ? "allow" : "deny";
      permissions.execute = permsRaw.execute === "allow" ? "allow" : "deny";
    }

    if (!body) return null;

    const id =
      "custom-" + filePath.replace(/[/\\]/g, "-").replace(/\.md$/i, "");

    return {
      id,
      name,
      mode,
      permissions,
      systemPrompt: body,
    };
  } catch {
    return null;
  }
}

export function loadCustomAgents(): AgentDefinition[] {
  const agents: AgentDefinition[] = [];

  for (const dir of [PROJECT_AGENTS_DIR, GLOBAL_AGENTS_DIR]) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith(".md")) {
          const file = join(dir, entry);
          const agent = loadAgentFile(file);
          if (agent) agents.push(agent);
        }
      }
    } catch {
      // directory not readable
    }
  }

  return agents;
}
