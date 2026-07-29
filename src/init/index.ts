import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { getRules, type ProjectTemplate } from "./templates";

export type InitOptions = {
  dir: string;
  lang?: string;
  framework?: string;
  docs?: string;
  sqa?: string;
  offshore?: boolean;
  force?: boolean;
};

export function initProject(options: InitOptions): { created: string[]; errors: string[] } {
  const created: string[] = [];
  const errors: string[] = [];
  const projectDir = resolve(options.dir);

  if (!existsSync(projectDir)) {
    try {
      mkdirSync(projectDir, { recursive: true });
    } catch (e) {
      errors.push(`Cannot create directory: ${projectDir}`);
      return { created, errors };
    }
  }

  const mtcDir = join(projectDir, ".mtc");

  // Resolve template options
  const docLang = (options.docs === "jp" || options.docs === "both") ? options.docs as "jp" | "both" : "en";
  const sqaLevel = options.sqa === "strict" ? "strict" : "basic";
  const framework = options.framework || "typescript";
  const lang = options.lang || "typescript";
  const offshore = options.offshore === true;

  const tmpl: ProjectTemplate = {
    name: lang,
    framework,
    docLang,
    sqa: sqaLevel,
    offshore,
  };

  // Create .mtc directory structure
  const dirs = [
    join(mtcDir, "rules"),
    join(mtcDir, "agents"),
  ];

  for (const d of dirs) {
    try {
      mkdirSync(d, { recursive: true });
      created.push(d);
    } catch (e) {
      errors.push(`Cannot create directory: ${d}`);
    }
  }

  // Create .mtc/mcp.json template
  const mcpConfig = {
    mcpServers: {},
  };
  try {
    const mcpPath = join(mtcDir, "mcp.json");
    if (!existsSync(mcpPath) || options.force) {
      writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
      created.push(mcpPath);
    }
  } catch (e) {
    errors.push(`Cannot create mcp.json`);
  }

  // Create AGENTS.md template
  const agentsMdContent = `---
name: ${framework || lang}-specialist
mode: subagent
permissions:
  read: allow
  bash: deny
  edit: deny
  execute: deny
---

You are a ${framework || lang} specialist agent. You help developers understand the codebase,
review code for compliance with project standards, and suggest improvements.

## Your Role
- Answer questions about the ${framework || lang} codebase
- Review code against the project's coding standards and SQA guidelines
- Suggest refactoring opportunities
- Identify potential bugs and security issues

## Rules
- Read-only agent: you cannot modify files or run commands.
- Always reference the project's rules in .mtc/rules/ when reviewing.
- Be constructive and specific in your suggestions.
`;
  try {
    const agentsMdPath = join(mtcDir, "agents", `${framework || "project"}-specialist.md`);
    if (!existsSync(agentsMdPath) || options.force) {
      writeFileSync(agentsMdPath, agentsMdContent, "utf-8");
      created.push(agentsMdPath);
    }
  } catch (e) {
    errors.push(`Cannot create agent file`);
  }

  // Create AGENTS.md at project root
  try {
    const agPath = join(projectDir, "AGENTS.md");
    if (!existsSync(agPath) || options.force) {
      writeFileSync(agPath, agentGuidelines(tmpl), "utf-8");
      created.push(agPath);
    }
  } catch (e) {
    errors.push(`Cannot create AGENTS.md`);
  }

  // Create rule files
  const rules = getRules(tmpl);
  for (const rule of rules) {
    const rulePath = join(mtcDir, "rules", rule.path);
    try {
      if (!existsSync(rulePath) || options.force) {
        writeFileSync(rulePath, rule.content, "utf-8");
        created.push(rulePath);
      }
    } catch (e) {
      errors.push(`Cannot create rule: ${rule.path}`);
    }
  }

  // Create .gitignore entry for .mtc if not present
  const gitignorePath = join(projectDir, ".gitignore");
  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, "utf-8");
      if (!content.includes(".mtc/")) {
        writeFileSync(gitignorePath, content + "\n# MTC agent config\n.mtc/\n", "utf-8");
        created.push(gitignorePath);
      }
    }
  } catch {
    // non-fatal
  }

  return { created, errors };
}

function agentGuidelines(tmpl: ProjectTemplate): string {
  const docSection = tmpl.docLang === "jp"
    ? "Documentation must be written in Japanese (README, JSDoc, API docs)."
    : tmpl.docLang === "both"
      ? "Documentation must be provided in both English and Japanese."
      : "Documentation must be written in English.";

  return `# Agent Guidelines for ${tmpl.framework || tmpl.name} Project

This file defines how MTC agents should behave when working on this project.

## General Instructions
- ${docSection}
- Follow the coding standards defined in .mtc/rules/coding-standards.md
- Follow SQA guidelines defined in .mtc/rules/sqa-guidelines.md
- Use the review checklist in .mtc/rules/review-checklist.md for PR reviews
${tmpl.offshore
    ? "- Consider timezone differences for offshore collaboration.\n- Use English for all code-related communication.\n- See .mtc/rules/offshore-collaboration.md for details."
    : ""}
## Quality Requirements
- All code must pass type checking and linting.
- Tests must be provided for new functionality.
- Performance and security must be reviewed.
- Do not leave debugging statements, console.log, or TODO/FIXME without tracking.

## Output Format
- Provide clear, actionable feedback.
- Reference specific line numbers and file paths.
- Suggest concrete fixes, not just problems.
- Prioritize findings by severity (critical, major, minor, suggestion).
`;
}
