# Contributing to MTC

Guidelines for contributing code, documentation, or plugins to the MetaTeam
Code Agent platform.

---

## Code of Conduct

Be respectful, inclusive, and constructive. We follow the MetaTeam Engineering
Code of Conduct. Harassment or abusive behavior will not be tolerated.

## Getting Started

1. Read the [Architecture Overview](./architecture.md)
2. Set up your environment per [Onboarding Guide](./onboarding.md)
3. Find an issue labeled `good-first-issue` or `help-wanted`
4. Comment on the issue to let others know you're working on it

## Development Workflow

```bash
# Start development server (with hot-reload)
bun run dev

# Type check
bun run typecheck

# Run eval tests
bun run test:eval
```

### Branch Naming

```
feature/<short-description>
fix/<issue-number>-<short-description>
docs/<short-description>
release/<version>
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add --json flag to mtc review
fix: handle empty mcp.json gracefully
docs: update onboarding guide
refactor: extract token counting to utils
chore: bump dependencies
```

## Pull Request Process

1. **Scope** — Keep PRs focused on a single change. Split large features.
2. **Tests** — Add or update tests for all new functionality
3. **Docs** — Update relevant documentation
4. **CI** — All checks must pass
5. **Review** — Request review from relevant maintainers
6. **Merge** — Squash-merge to `main` after approval

### PR Checklist

```markdown
- [ ] Tests pass (`bun run typecheck && bun run test:eval`)
- [ ] Documentation updated
- [ ] CHANGELOG.md entry added
- [ ] Breaking changes noted with migration guide
- [ ] Security implications considered
```

## Coding Standards

- **Language:** TypeScript (strict mode)
- **Formatting:** No linter configuration yet — follow existing code style
- **Imports:** Use ES module imports; no `require()`
- **Async:** Prefer `async/await` over raw promises
- **Error handling:** Use typed errors; avoid `throw new Error('string')`
- **Console:** Use the UI abstraction, not raw `console.log`

## Testing

- **Eval tests:** Located in `tests/evals/`, run with `bun run test:eval`
- **Manual testing:** Use `bun run dev` and test against a sample project
- **MCP plugin testing:** Use the scaffold in `docs/templates/mcp-plugin-scaffold.ts`

## Documentation

Docs live in `docs/` as Markdown files. When adding features:

1. Update or create docs in `docs/internal/`
2. Add an entry to the [Portal Index](./README.md)
3. Update the [Playbook](../playbook.md) for workflow changes
4. Update [CHANGELOG.md](../../CHANGELOG.md)

## Plugin Contributions

See [MCP Integrations](./mcp-integrations.md) for plugin development guide.

All plugins must:
- Pass a security review
- Include a README with setup instructions
- Register in `.mtc/mcp.json` format
- Provide at least 2 example tool calls
