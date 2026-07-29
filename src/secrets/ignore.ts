import { existsSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { homedir } from "os";

const PROJECT_IGNORE = join(process.cwd(), ".mtcignore");
const GLOBAL_IGNORE = join(homedir(), ".config", "mtc", ".mtcignore");

let cachedPatterns: string[] | null = null;

function parseIgnoreFile(path: string): string[] {
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return [];
    const content = readFileSync(path, "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

export function loadIgnorePatterns(): string[] {
  if (cachedPatterns !== null) return cachedPatterns;

  const patterns = [
    ...parseIgnoreFile(PROJECT_IGNORE),
    ...parseIgnoreFile(GLOBAL_IGNORE),
  ];

  cachedPatterns = patterns;
  return patterns;
}

export function reloadIgnorePatterns(): string[] {
  cachedPatterns = null;
  return loadIgnorePatterns();
}

function matchGlob(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  let pat = pattern.replace(/\\/g, "/").trim();

  const negate = pat.startsWith("!");
  if (negate) pat = pat.slice(1);

  // Directory wildcard (trailing /)
  const isDirPattern = pat.endsWith("/");
  if (isDirPattern) pat = pat.slice(0, -1);

  // Escape dots in the pattern for regex conversion
  const regexStr =
    "^" +
    pat
      .split(/(\*\*\/|\*|\?)/g)
      .map((seg) => {
        if (seg === "**/") return "(?:.+/)?";
        if (seg === "*") return "[^/]*";
        if (seg === "?") return "[^/]";
        return seg.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      })
      .join("") +
    (isDirPattern ? "(?:/.*)?$" : "$");

  const regexp = new RegExp(regexStr);
  const matched = regexp.test(normalized);

  return negate ? !matched : matched;
}

export function isPathIgnored(filePath: string): boolean {
  const patterns = loadIgnorePatterns();
  if (patterns.length === 0) return false;

  const cwd = process.cwd().replace(/\\/g, "/");
  const normalized = filePath.replace(/\\/g, "/");
  const relPath = normalized.startsWith(cwd)
    ? normalized.slice(cwd.length + 1)
    : normalized;

  let ignored = false;
  for (const pattern of patterns) {
    if (matchGlob(relPath, pattern)) {
      ignored = !pattern.startsWith("!");
    }
  }

  return ignored;
}

export { PROJECT_IGNORE, GLOBAL_IGNORE };
