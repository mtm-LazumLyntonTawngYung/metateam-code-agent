# Development Guidelines

Coding standards, testing requirements, and contribution workflow for **mtc**.

---

## Coding Standards

### Language & Tooling

- **Language:** TypeScript with strict mode enabled
- **Runtime:** Bun (JavaScript/TypeScript runtime)
- **UI Framework:** Ink (React for CLIs)
- **CLI Framework:** Commander
- **Testing:** Eval tests in `tests/evals/`

### Style Conventions

- **Imports:** ES module imports only, no `require()`
- **Naming:** camelCase for variables/functions, PascalCase for types/components
- **Async:** Use `async/await` over raw promises
- **Error handling:** Use typed errors, avoid generic `throw new Error()`
- **Console:** Use the UI abstraction via Ink components, not `console.log`
- **File size:** Keep files under 400 lines where possible
- **Types:** Prefer interfaces over type aliases for object shapes

### Project Structure

```
src/
├── cli.tsx              # Entry point
├── agents/              # Agent definitions, loop, subagents, rules
├── auth/                # SSO authentication
├── config/              # Configuration
├── daemon/              # Headless autofix daemon
├── enterprise/          # License, audit, orgs, dashboard
├── eval/                # Eval runner
├── init/                # Scaffolding
├── llm/                 # LLM clients, routing
├── mcp/                 # MCP integration
├── mcp-plugins/         # Bundled MCP bridges
├── review/              # SQA review
├── secrets/             # Secret redaction
├── server/              # WebSocket server
├── session/             # History/state
├── skills/              # Skill registry
├── telemetry/           # Analytics
├── tools/               # Tool implementations
├── ui/                  # Ink components
└── utils/               # Helpers
```

## Testing

### Eval Tests

Located in `tests/evals/`:

```
tests/evals/
├── add-unit-tests/      # Eval: adding tests
├── fix-broken-test/     # Eval: fixing broken tests
└── refactor-to-typescript/  # Eval: TS migration
```

List and run:

```bash
mtc eval list
mtc eval run <task-name>
```

### Adding Eval Tests

1. Create a directory in `tests/evals/<name>/`
2. Add a `task.md` describing the task
3. Add `setup.sh`, `sandbox/`, and an `assert.sh` (or `assert.cjs`) script
4. Run with `mtc eval run <name>`

## Development Workflow

```bash
# Start the TUI (dev mode)
bun run dev

# Type check
bun run typecheck

# Build binary
bun run build
```

## Pull Request Checklist

Before submitting a PR:

- [ ] `bun run typecheck` passes
- [ ] `mtc eval run <name>` passes for affected tasks (or new eval added)
- [ ] Documentation updated
- [ ] CHANGELOG.md entry added
- [ ] No secrets or credentials committed
- [ ] PR description explains the change and motivation
