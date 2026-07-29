# AI Workflows

Guide to using **mtc** effectively with Plan/Build patterns and prompt
engineering.

---

## The Plan → Build → Verify Pattern

The most effective workflow for complex changes:

```
1. Plan — Explore codebase, design approach (read-only)
2. Build — Implement changes (full access)
3. Verify — Run tests, review diff
```

### Step 1: Plan

```bash
# Switch to Plan agent (Tab), then:
Read the auth module and suggest improvements for:
1. Error handling gaps
2. Type safety issues
3. Test coverage
```

### Step 2: Build

```bash
# Switch to Build agent, then:
Implement the plan:
- Add proper error types to src/services/auth.ts
- Add null checks in all public functions
- Run tests after each change
```

### Step 3: Verify

```bash
# Switch to Plan agent:
Verify the implementation:
1. Check all error cases are handled
2. Confirm no regressions
3. Review the diff
```

## Prompt Engineering Patterns

### Chain-of-File Commands

```
/read src/config.ts
/read src/types.ts
/edit src/config.ts {old} {new}
/edit src/types.ts {old} {new}
```

### Progressive Refinement

```
# Round 1: Explore
/subagent explore /read src/services/auth.ts

# Round 2: Plan
/subagent plan Read the auth module. Plan rate limiting.

# Round 3: Build
/subagent build Implement the rate limiting plan.
```

### Adding Constraints

```
Refactor the payment flow.

Do NOT:
- Change the database schema
- Add new dependencies
- Remove existing tests
```

## Subagent Delegation

Use `/subagent` to delegate tasks to specialized agents:

```
/subagent migration-specialist
  Analyze src/legacy/*.js and produce migration plan
  Mapping: jQuery AJAX → fetch()
```

## Best Practices

- **Be specific** — Mention exact files, patterns, and constraints
- **One change at a time** — Don't ask for multiple unrelated changes
- **Test after each step** — Catch regressions early
- **Use git** — Work on a clean branch for easy rollback
- **Keep context small** — Read only the files you need
