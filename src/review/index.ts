import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";

export type ReviewSeverity = "critical" | "major" | "minor" | "suggestion";

export type ReviewFinding = {
  severity: ReviewSeverity;
  file: string;
  line?: number;
  message: string;
  rule: string;
};

export type ReviewResult = {
  passed: boolean;
  findings: ReviewFinding[];
  summary: {
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
    total: number;
  };
};

export type ReviewOptions = {
  dir?: string;
  files?: string[];
  verbose?: boolean;
};

const SECRET_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /(?:sk-[A-Za-z0-9]{20,})/, description: "OpenAI API key" },
  { pattern: /(?:sk-ant-[A-Za-z0-9]{20,})/, description: "Anthropic API key" },
  { pattern: /(?:ghp_[A-Za-z0-9]{36})/, description: "GitHub personal access token" },
  { pattern: /(?:gho_[A-Za-z0-9]{36})/, description: "GitHub OAuth access token" },
  { pattern: /(?:ghu_[A-Za-z0-9]{36})/, description: "GitHub user-to-server token" },
  { pattern: /(?:ghs_[A-Za-z0-9]{36})/, description: "GitHub server-to-server token" },
  { pattern: /(?:ghr_[A-Za-z0-9]{36})/, description: "GitHub refresh token" },
  { pattern: /(?:AKIA[0-9A-Z]{16})/, description: "AWS access key" },
  { pattern: /(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/, description: "Private key" },
  { pattern: /(?:xox[baprs]-[A-Za-z0-9-]{10,})/, description: "Slack token" },
  { pattern: /(?:pk_live_[A-Za-z0-9]{24,})/, description: "Stripe live key" },
  { pattern: /(?:sk_live_[A-Za-z0-9]{24,})/, description: "Stripe secret key" },
  { pattern: /(?:Basic [A-Za-z0-9+/=]{20,})/, description: "Basic auth credentials" },
];

const DEBUG_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /\bconsole\.log\s*\(/, description: "console.log statement" },
  { pattern: /\bdebugger\s*;/, description: "debugger statement" },
  { pattern: /\bdump\s*\(/, description: "debug dump call" },
];

export function reviewProject(options: ReviewOptions): ReviewResult {
  const rootDir = options.dir ? resolve(options.dir) : process.cwd();
  const findings: ReviewFinding[] = [];
  const rulesDir = join(rootDir, ".mtc", "rules");

  // Load SQA rules for context
  const sqaContent = loadRuleFile(join(rulesDir, "sqa-guidelines.md"));

  // Determine which files to review
  const filesToReview = options.files ?? discoverFiles(rootDir);

  for (const file of filesToReview) {
    const absPath = resolve(rootDir, file);
    if (!existsSync(absPath) || !statSync(absPath).isFile()) continue;
    if (isBinaryFile(file)) continue;

    const relPath = relative(rootDir, absPath);
    const content = readFileSync(absPath, "utf-8");
    const lines = content.split("\n");

    // Check for hardcoded secrets
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const sp of SECRET_PATTERNS) {
        if (sp.pattern.test(line)) {
          findings.push({
            severity: "critical",
            file: relPath,
            line: i + 1,
            message: `Hardcoded ${sp.description} detected`,
            rule: "sqa-guidelines",
          });
        }
      }

      // Check for long lines (>120 chars) in code files
      if (isCodeFile(file) && line.length > 120 && line.trim()) {
        findings.push({
          severity: "minor",
          file: relPath,
          line: i + 1,
          message: `Line too long (${line.length} chars, max 120)`,
          rule: "coding-standards",
        });
      }
    }

    // Check for debug artifacts
    for (const dp of DEBUG_PATTERNS) {
      const matches = content.match(dp.pattern);
      if (matches) {
        const lineIdx = findLine(lines, matches[0]);
        const severity = dp.description.includes("console.log") || dp.description.includes("debugger") ? "major" : "minor";
        findings.push({
          severity: severity as ReviewSeverity,
          file: relPath,
          line: lineIdx,
          message: `${dp.description} found`,
          rule: "coding-standards",
        });
      }
    }
  }

  // Check for missing mandatory files
  const mandatoryFiles = ["README.md", "CHANGELOG.md", ".gitignore", join(".mtc", "mcp.json")];
  for (const mf of mandatoryFiles) {
    const mfPath = join(rootDir, mf);
    if (!existsSync(mfPath)) {
      findings.push({
        severity: "major",
        file: mf,
        message: `Mandatory file missing: ${mf}`,
        rule: "project-structure",
      });
    }
  }

  // Check for missing tests directory
  if (!existsSync(join(rootDir, "tests")) && !existsSync(join(rootDir, "__tests__"))) {
    findings.push({
      severity: "major",
      file: "tests/",
      message: "No tests directory found",
      rule: "sqa-guidelines",
    });
  }

  // Determine pass/fail
  const critical = findings.filter((f) => f.severity === "critical").length;
  const major = findings.filter((f) => f.severity === "major").length;
  const minor = findings.filter((f) => f.severity === "minor").length;
  const suggestion = findings.filter((f) => f.severity === "suggestion").length;

  const passed = critical === 0;

  return {
    passed,
    findings,
    summary: { critical, major, minor, suggestion, total: findings.length },
  };
}

function discoverFiles(root: string): string[] {
  const files: string[] = [];
  const excludeDirs = new Set(["node_modules", ".git", "dist", "out", "build", ".mtc", "vscode-mtc", "bin"]);

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (!excludeDirs.has(entry)) walk(full);
        } else if (stat.isFile()) {
          files.push(full);
        }
      } catch {
        // skip unreadable
      }
    }
  }

  walk(root);
  return files;
}

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const binaryExts = new Set([
    "png", "jpg", "jpeg", "gif", "ico", "svg",
    "woff", "woff2", "ttf", "eot", "pdf",
    "zip", "gz", "tar", "exe", "dll", "so", "dylib", "vsix", "node",
  ]);
  return binaryExts.has(ext);
}

function isCodeFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "rs", "go", "java", "rb", "php", "cs",
    "swift", "kt", "scala", "cpp", "c", "h", "hpp",
    "css", "scss", "less", "html",
    "json", "yaml", "yml", "toml",
    "sh", "bash", "zsh", "fish", "ps1",
    "sql", "graphql", "proto", "md", "tsv", "csv",
  ]);
  return codeExts.has(ext);
}

function findLine(lines: string[], target: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(target)) return i + 1;
  }
  return 1;
}

function loadRuleFile(path: string): string {
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8");
  } catch {
    // ignore
  }
  return "";
}
