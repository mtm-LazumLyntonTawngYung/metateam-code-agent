# Best Practices

Recommendations for getting the most out of **mtc**.

---

## Prompt Design

- **Be specific** — Mention exact files, patterns, and constraints
- **Scope clearly** — Define what's in and what's out
- **Provide context** — Link to related code, ADRs, or tickets
- **Use constraints** — Tell the agent what NOT to do
- **Verify** — Ask the agent to run tests after changes

## Session Management

- **Start fresh for each task** — Don't accumulate context from unrelated work
- **Use git branches** — mtc works best on a clean branch
- **Break large tasks** — Split into <5 file batches
- **Clear context** — Use `/clear` between unrelated tasks
- **Review history** — Use `/history` to review what was done

## Agent Selection

- **Plan mode for exploration** — Safe, read-only
- **Build mode for execution** — Full permissions
- **Custom agents for repeated tasks** — Migration, analysis, generation
- **Subagents for delegation** — `/subagent` for parallel work

## Code Quality

- **Review the diff** — Don't blindly accept all changes
- **Run tests** — Gate every change with test execution
- **Check types** — `bun run typecheck` catches many issues
- **Keep rules concise** — `.mtc/rules/` files under 5KB each

## Performance

- **Point to files** — Use `/read path` instead of broad searches
- **Use glob to narrow** — Find files before reading them
- **Batch wisely** — 5 files per batch is a good limit
- **Watch token usage** — Check `mtc analytics` for trends

## Security

- **Review permissions** — Ensure agents have minimum needed access
- **Audit custom agents** — Verify they don't have excessive permissions
- **Check secrets** — Ensure no keys in session history
- **Review MCP plugins** — Audit before connecting to production tools
