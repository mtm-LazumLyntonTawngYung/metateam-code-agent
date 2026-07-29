import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const RULES_DIR = join(process.cwd(), ".mtc", "rules");
const AGENTS_MD = join(process.cwd(), "AGENTS.md");

let cachedRules: string | null = null;

function loadFile(path: string): string | null {
  try {
    if (existsSync(path) && statSync(path).isFile()) {
      return readFileSync(path, "utf-8").trim();
    }
  } catch {
    // not readable
  }
  return null;
}

function loadRulesDir(dir: string): string | null {
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
    const parts: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isFile()) {
        const content = readFileSync(full, "utf-8").trim();
        if (content) parts.push(`### ${entry}\n\n${content}`);
      }
    }
    return parts.length ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

export function loadRules(): string {
  const parts: string[] = [];

  const rulesContent = loadRulesDir(RULES_DIR) ?? loadFile(RULES_DIR);
  if (rulesContent) {
    parts.push(`## Engineering Rules\n\n${rulesContent}`);
  }

  const agentsMd = loadFile(AGENTS_MD);
  if (agentsMd) {
    const body = agentsMd.replace(/^---[\s\S]*?---\n?/, "").trim();
    if (body) {
      parts.push(`## Agent Guidelines\n\n${body}`);
    }
  }

  return parts.join("\n\n");
}

export function getRules(): string {
  if (cachedRules === null) {
    cachedRules = loadRules();
  }
  return cachedRules;
}

export function reloadRules(): string {
  cachedRules = loadRules();
  return cachedRules;
}
