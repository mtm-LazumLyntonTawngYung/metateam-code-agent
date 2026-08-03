# Repository Management

Guidelines for managing the **mtc** codebase, permissions, branching,
and CI/CD.

---

## Repository Structure

The mtc codebase lives in a GitHub repository:

```
github.com/mtm-LazumLyntonTawngYung/metateam-code-agent
```

### Repository Contents

| Path | Description |
|------|-------------|
| `src/` | Source code |
| `bin/` | Compiled binary |
| `docs/` | Documentation |
| `.mtc/` | MTC configuration |
| `vscode-mtc/` | VS Code extension |
| `tests/` | Eval tests |
| `.github/` | CI/CD workflows, templates |

## Branch Strategy

```
main        — Production-ready releases
develop     — Integration branch for the next release
feature/*   — Feature branches (feature/#<issue>-<description>)
fix/*       — Bug fix branches
docs/*      — Documentation changes
release/*   — Release preparation
hotfix/*    — Emergency fixes from main
```

## Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Platform Lead** | Admin — all operations |
| **Core Maintainer** | Write — push to `next`, manage releases |
| **Contributor** | Write to feature/fix branches, PR to `next` |
| **Reviewer** | Read + PR review access |
| **External** | No direct access (public docs only) |

## CI/CD Pipeline

The `.github/workflows/` directory contains:

| Workflow | Trigger | Description |
|----------|---------|-------------|
| MTC Review (`mtc-review.yml`) | PR opened/synchronize/reopened | Runs `mtc review --files ... --json` on changed files, posts a summary comment and commit status |
| Release (`release.yml`) | Tag push (`v*`) | Compiles binaries for macOS (ARM64), Linux (x64), Windows (x64); creates a GitHub Release with checksums |

### CI Requirements

All checks must pass before merge:
1. MTC review passes (zero critical findings)
2. No secrets detected

## Secrets Management

Repository secrets (GitHub Actions):

| Secret | Used For |
|--------|----------|
| `GITHUB_TOKEN` | Auto-generated, used by the review workflow and releases |

Never commit secrets to the repository. Use environment variables or
`.env` files (added to `.gitignore`).

## Versioning & Tags

Tags follow the pattern `v<major>.<minor>.<patch>`:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Tags trigger the Release workflow, which builds binaries and creates a
GitHub Release.

## Dependency Management

- **Runtime deps:** Declared in `package.json` — review before adding
- **Dev deps:** Keep minimal; prefer Bun built-ins
- **Updates:** Dependencies reviewed monthly for security patches
- **Audits:** Run `npm audit` before each release
