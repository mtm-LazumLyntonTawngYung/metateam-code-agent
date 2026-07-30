import { readFileSync } from "fs";
import { join } from "path";

export function getCurrentBranch(): string | null {
  try {
    const headPath = join(process.cwd(), ".git", "HEAD");
    const head = readFileSync(headPath, "utf-8").trim();
    const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return refMatch ? refMatch[1] : null;
  } catch {
    return null;
  }
}