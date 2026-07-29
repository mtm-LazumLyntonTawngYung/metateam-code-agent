# Repository Management

Guidelines for managing the **mtc** codebase, permissions, branching,
and CI/CD.

---

## Repository Structure

The mtc codebase lives in a private GitHub repository:

```
github.com/metateam/mtc
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
next        — Staging branch for next release
feature/*   — Feature branches
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
| CI | PR, push to `next` | Type check, eval tests, lint |
| Release | Tag push (`v*`) | Build binaries, create GitHub Release |
| Review | PR opened | Run `mtc review` on diff |

### CI Requirements

All checks must pass before merge:
1. TypeScript type check
2. Eval tests pass
3. No secrets detected

## Secrets Management

Repository secrets (GitHub Actions):

| Secret | Used For |
|--------|----------|
| `OPENAI_API_KEY` | Eval tests in CI |
| `GITHUB_TOKEN` | Auto-generated, used for release |

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
- **Audits:** Run `bun audit` before each release
