import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { getCatalog } from "./catalog";
import { parseFrontmatter } from "../agents/frontmatter";
import { loadConfig, saveConfig } from "../config";
import type { Skill, SkillOrigin, SkillStatus } from "./types";

const PROJECT_SKILLS_DIR = join(process.cwd(), ".mtc", "skills");
const GLOBAL_SKILLS_DIR = join(homedir(), ".mtc", "skills");

function getInstalledIds(): string[] {
  return loadConfig().installedSkills ?? [];
}

function saveInstalledIds(ids: string[]): void {
  saveConfig({ installedSkills: ids });
}

function scanDir(dir: string, origin: SkillOrigin): Skill[] {
  if (!existsSync(dir)) return [];
  const result: Skill[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const skillDir = join(dir, entry);
      if (!statSync(skillDir).isDirectory()) continue;
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      try {
        const content = readFileSync(skillFile, "utf-8");
        const parsed = parseFrontmatter(content);
        if (!parsed) continue;
        const { frontmatter, body } = parsed;
        const id = String(frontmatter.name ?? entry);
        if (!id) continue;
        result.push({
          id,
          name: String(frontmatter.name ?? id),
          description: String(frontmatter.description ?? ""),
          category: "development",
          status: "installed",
          origin,
          tags: [],
          body: body || undefined,
        });
      } catch {
        // skip unreadable skill files
      }
    }
  } catch {
    // skip unreadable directories
  }
  return result;
}

export function getFileSkills(): Skill[] {
  const scanned: Skill[] = [];
  for (const s of scanDir(PROJECT_SKILLS_DIR, "workspace")) scanned.push(s);
  for (const s of scanDir(GLOBAL_SKILLS_DIR, "global")) {
    if (!scanned.find((x) => x.id === s.id)) scanned.push(s);
  }
  return scanned;
}

export function getAllSkills(): Skill[] {
  const installed = new Set(getInstalledIds());
  const fileSkills = getFileSkills();
  const fileIds = new Set(fileSkills.map((s) => s.id));
  const catalog = getCatalog().map((s) => ({
    ...s,
    status: (installed.has(s.id) ? "installed" : "available") as SkillStatus,
  }));
  return [...fileSkills, ...catalog.filter((s) => !fileIds.has(s.id))];
}

export function getInstalledSkills(): Skill[] {
  return getAllSkills().filter((s) => s.status === "installed");
}

export function installSkill(id: string): boolean {
  const ids = getInstalledIds();
  if (ids.includes(id)) return false;
  saveInstalledIds([...ids, id]);
  return true;
}

export function uninstallSkill(id: string): boolean {
  const ids = getInstalledIds().filter((i) => i !== id);
  if (ids.length === getInstalledIds().length) return false;
  saveInstalledIds(ids);
  return true;
}
