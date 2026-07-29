export type ProjectTemplate = {
  name: string;
  framework?: string;
  docLang: "en" | "jp" | "both";
  sqa: "basic" | "strict";
  offshore: boolean;
};

export type RuleFile = {
  path: string;
  content: string;
};

export function getRules(tmpl: ProjectTemplate): RuleFile[] {
  const files: RuleFile[] = [];
  files.push({ path: "coding-standards.md", content: codingStandards(tmpl) });
  files.push({ path: "documentation.md", content: documentationGuidelines(tmpl) });
  files.push({ path: "sqa-guidelines.md", content: sqaGuidelines(tmpl) });
  files.push({ path: "project-structure.md", content: projectStructure(tmpl) });
  files.push({ path: "review-checklist.md", content: reviewChecklist(tmpl) });
  if (tmpl.offshore) {
    files.push({ path: "offshore-collaboration.md", content: offshoreCollaboration(tmpl) });
  }
  return files;
}

function codingStandards(tmpl: ProjectTemplate): string {
  return `# Coding Standards

## General Principles
- Write readable, self-documenting code. Avoid unnecessary comments.
- Follow the principle of least surprise.
- Prefer composition over inheritance.
- Keep functions small and focused on a single responsibility.
- Use meaningful names for variables, functions, and classes.

## ${tmpl.framework || tmpl.name} Conventions
- Follow the official style guide for the framework.
- Use consistent import ordering: external → internal → relative.
- Use named exports over default exports.
${tmpl.docLang === "jp" ? "- All code identifiers in English; comments in Japanese.\n- JSDoc/TSDoc in Japanese where public API.\n" : ""}${tmpl.docLang === "both" ? "- Code identifiers in English; JSDoc in both English and Japanese.\n- Use English for technical terms, Japanese for explanations.\n" : ""}
## Error Handling
- Handle errors explicitly; avoid silent catch blocks.
- Use typed errors where possible.
- Log errors with sufficient context for debugging.

## Testing
- Write tests alongside implementation.
- Aim for >80% coverage on critical paths.
- Use descriptive test names following the pattern: \`should [expected behavior] when [condition]\`.
`;
}

function documentationGuidelines(tmpl: ProjectTemplate): string {
  const jpSection = tmpl.docLang === "jp" || tmpl.docLang === "both" ? `
## 日本語ドキュメント規約 (Japanese Documentation Standards)
- すべての公開APIには日本語の説明を付けること。
- 技術用語は英語のまま使用し、初出時に日本語訳を括弧書きで併記する。
  - 例: "非同期処理 (asynchronous processing)"
- ドキュメントのトーンは「です・ます調」を基本とする。
- コードブロック内のコメントは英語でも可とする。
- README は日本語と英語の両方で提供する。
- 変更履歴 (CHANGELOG) は英語で記述する。
` : "";

  const enSection = tmpl.docLang === "en" || tmpl.docLang === "both" ? `
## English Documentation Standards
- All public APIs must have English descriptions.
- Use active voice and present tense.
- Keep sentences short and clear.
- Provide README in English (and Japanese if both).
- CHANGELOG in English.
` : "";

  return `# Documentation Guidelines

${jpSection}
${enSection}
## Common Rules
- Document the "why" not the "what" — code already shows what.
- Keep docs close to the code (JSDoc/TSDoc, inline comments).
- Update documentation when changing behavior.
- Include at minimum: README.md, CHANGELOG.md, and API docs for public interfaces.

## File Headers
- Every source file should start with a brief description of its purpose.
- Include the file's responsibility and any side effects.

## README Template
- Project name and description
- Quick start / installation
- Available scripts
- Project structure overview
- Environment variables
- Deployment instructions
- Contributing guidelines
`;
}

function sqaGuidelines(tmpl: ProjectTemplate): string {
  const strictSection = tmpl.sqa === "strict" ? `
## Strict Compliance Requirements
- 100% test coverage on all public APIs.
- All errors must have typed error codes.
- Every PR must include tests for new/changed functionality.
- Static analysis (lint, type-check) must pass with zero warnings.
- Performance benchmarks must not regress beyond 5%.
- Security scan must be clean (no critical/high findings).
- Accessibility compliance (WCAG 2.1 AA minimum) for UI projects.
- Dependency licenses must be compatible with project license.
` : `
## Basic Quality Checks
- Tests must pass before merge.
- Linting must pass with no errors (warnings allowed).
- Type-checking must pass.
- No hardcoded secrets or credentials.
- PRs should include tests for new functionality.
`;

  return `# SQA Guidelines

## Quality Gates
${strictSection}
## Code Review Standards
- Every commit must be reviewed before merging.
- Reviewers should verify:
  - Correctness: does the code do what it claims?
  - Security: no injection, no leaked secrets, no unsafe patterns.
  - Performance: no obvious N+1 queries, no memory leaks.
  - Maintainability: is the code easy to understand and modify?
  - Test coverage: are there adequate tests?

## Automated Checks
- Run \`mtc review\` before submitting a PR for human review.
- The review will check compliance with these SQA guidelines.
- Address all "FAIL" results before requesting human review.

## Security
- No secrets in code (API keys, tokens, passwords).
- Validate all user input.
- Use parameterized queries for database access.
- Keep dependencies up to date.
- Run \`npm audit\` or equivalent regularly.
`;
}

function projectStructure(tmpl: ProjectTemplate): string {
  return `# Project Structure

## Directory Layout
\`\`\`
.
├── .mtc/                  # MTC agent configuration
│   ├── rules/             # Project rules and guidelines
│   ├── agents/            # Custom agent definitions
│   └── mcp.json           # MCP server configuration
├── src/                   # Source code
│   ├── index.ts           # Entry point
│   ├── components/        # UI components (if applicable)
│   ├── services/          # Business logic
│   └── utils/             # Utility functions
├── tests/                 # Test files
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── docs/                  # Documentation
├── scripts/               # Build and utility scripts
├── .env.example           # Environment variable template
├── AGENTS.md              # Agent guidelines (optional)
├── README.md              # Project README
└── CHANGELOG.md           # Version changelog
\`\`\`

## Naming Conventions
- Files: \`kebab-case.ts\` for utilities, \`PascalCase.tsx\` for components
- Classes: PascalCase
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Types/interfaces: PascalCase with I/F prefix (project-specific)

## Module Boundaries
- Keep modules small and focused (< 500 lines per file).
- Use barrel files (index.ts) to control public API surface.
- Avoid circular dependencies — use dependency injection where needed.
`;
}

function reviewChecklist(tmpl: ProjectTemplate): string {
  return `# PR Review Checklist

## Pre-Review (Automated — run \`mtc review\`)
- [ ] No hardcoded secrets or credentials
- [ ] Linting passes
- [ ] Type-checking passes
- [ ] Tests pass
- [ ] Adequate test coverage for changes
- [ ] No console.log / debugger statements left behind
${tmpl.docLang !== "en" ? "- [ ] Japanese documentation is accurate\n- [ ] Mixed language content follows guidelines\n" : ""}
## Human Review
### Functional
- [ ] Code implements the described requirements
- [ ] Edge cases are handled
- [ ] Error states are managed gracefully
- [ ] Side effects are documented

### Code Quality
- [ ] Follows project coding standards
- [ ] No unnecessary complexity or over-engineering
- [ ] Dependencies are justified (no "drive-by" additions)
- [ ] Performance considerations addressed

### Security & Compliance
- [ ] No injection vulnerabilities
- [ ] Authentication/authorization checks in place
- [ ] Data validation on all inputs
- [ ] Compliance with SQA guidelines

### Documentation
- [ ] Public API changes are documented
- [ ] README updated if needed
- [ ] CHANGELOG updated

## Final Sign-off
- [ ] All automated checks pass
- [ ] At least one reviewer approved
- [ ] No unresolved discussions
`;
}

function offshoreCollaboration(tmpl: ProjectTemplate): string {
  const jpNote = tmpl.docLang === "jp" || tmpl.docLang === "both"
    ? `- 日本人開発者とオフショア開発者の共同作業を前提とする。
- コードレビューは英語で行う。
- 仕様に関する議論は日本語と英語の両方で記録する。
`
    : "";
  return `# Offshore Collaboration Guidelines

## Communication
- All code-related communication in English.
- Use async communication (GitHub issues, PR comments) as primary channel.
- Document decisions in PR descriptions or linked issues.
- Keep a shared glossary of project-specific terms.
${jpNote}
## Workflow
- Offshore team commits to feature branches.
- Daily sync via automated status updates (no standup required).
- PRs should be small and focused (< 400 lines changed).
- Use the review checklist before submitting for review.

## Timezone Considerations
- Set expectations for response times (e.g., 24h for first review).
- Use PR drafts for early feedback without blocking.
- Batch review requests at the end of the offshore team's day.

## Code Ownership
- All team members can review any code.
- Domain experts have final say on their area.
- Shared components require two approvals.
`;
}
