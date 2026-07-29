# MTC Internal Playbook

## 1. Introduction

MTC (MetaTeam Code Agent) is an agentic coding assistant. Unlike autocomplete tools
that suggest the next token, MTC executes multi-step plans — reading your codebase,
reasoning about changes, writing files, and running commands. This playbook teaches
your team how to maximize those workflows.

---

## 2. Writing Effective Refactoring Prompts

Refactoring is where agentic tools deliver the most leverage. A bad prompt produces
half-baked changes; a great prompt produces production-ready code.

### 2.1 The Anatomy of a Refactoring Prompt

```
Target:   <exactly what needs to change>
Scope:    <which files or modules are involved>
Pattern:  <before → after transformation>
Constraints: <style, test, non-functional requirements>
Context:  <links to related code, ADRs, or tickets>
```

### 2.2 Example: Rename + Restructure

**Weak prompt:**
```
/read src/old-utils.ts
/read src/processor.ts
/write src/utils.ts {new content}
/edit src/processor.ts {import 'foo'} {import 'bar'}
```

**Strong prompt (use through an agent or `/subagent`):**
```
Refactor src/old-utils.ts into src/utils/ with three modules:
- src/utils/format.ts   — formatting helpers (extract from lines 1-80)
- src/utils/parse.ts    — parsing helpers (extract from lines 81-160)
- src/utils/index.ts    — barrel re-export

Update all imports across src/ to use 'src/utils/' instead of 'src/old-utils'.
Do not change any behavior. Keep existing test coverage.
Run `npm test` after the refactor to confirm nothing broke.
```

**Why the second works:** It specifies the target structure, the mapping rule,
the verification step, and the constraint (no behavior change).

### 2.3 Multi-File Refactoring Checklist

- [ ] **Boundary first** — Define what's in scope and what's out.
- [ ] **Before/after contract** — Specify what stays the same (API, behavior).
- [ ] **Dependency order** — Tell the agent which file to change first.
- [ ] **Test gate** — Ask the agent to run tests after each phase.
- [ ] **Rollback plan** — Use git: `mtc` works best on a clean branch.

### 2.4 Prompt Templates

**Extract shared logic:**
```
Target:  Duplicated validation logic in {files}
Action:  Extract into src/shared/validation.ts
         Import and use in all original locations
Verify:  Tests pass, no behavior change
```

**Migrate from library A to B:**
```
Target:  Replace {libA} with {libB} across src/
Pattern: {libA} API   →   {libB} equivalent
         {importA}    →   {importB}
Files:   {list of files that import libA}
Verify:  `npm run build` compiles cleanly
         All integration tests pass
```

**Split a monolith module:**
```
Target:  src/monolith.ts (currently 1200 lines)
Output:  src/services/{a,b,c}.ts
         src/types.ts
         src/index.ts (barrel)
Keep:    All public exports from monolith.ts re-exported through index.ts
Verify:  No broken imports, tests pass
```

---

## 3. Plan Mode vs Build Mode

MTC ships two primary agents: **Plan** (architecture) and **Build** (coding).

### 3.1 When to Use Plan Mode

| Situation | Use Plan? |
|-----------|-----------|
| You need an implementation strategy | Yes |
| You want to explore a codebase before modifying | Yes |
| You need a decision on architecture | Yes |
| The change touches >5 files | Start with Plan, then Build |
| Legacy code unfamiliarity | Start with Plan |
| Simple bug fix | No, go straight to Build |

**Plan mode is read-only.** It can read files, glob, and call MCP tools,
but it cannot write, edit, or run bash. This makes it safe for exploration.

**How to use Plan mode:**
```
Tab to switch to Plan agent, then ask:

I need to add WebSocket support for real-time notifications.
Read the current API structure and suggest:
1. File layout
2. Connection lifecycle
3. Error handling strategy
4. Testing approach
```

**Output expectation:** A Markdown plan with file paths, pseudocode,
and ordering. No actual code changes.

### 3.2 When to Use Build Mode

| Situation | Use Build? |
|-----------|------------|
| The plan is clear (from Plan or otherwise) | Yes |
| Fixing a known bug | Yes |
| Implementing a well-specified feature | Yes |
| You're confident in the approach | Yes |
| You need to explore first | No, use Plan first |

**Build mode has full permissions.** It can read, write, edit, and run bash.

**How to use Build mode:**
```
Switch to Build agent, then:

Implement the WebSocket notifications from the plan in plan.md.
Files to create: src/ws/client.ts, src/ws/server.ts, src/ws/types.ts
Files to modify: src/index.ts (register WS routes)
Run tests after each file.
```

### 3.3 Plan → Build Handoff Pattern

This is the most effective workflow for complex changes:

1. **Plan:** Explore, analyze, write plan → output saved to `plan.md`
2. **Review:** Read `plan.md`, make corrections
3. **Build:** Feed `plan.md` into Build agent → execute step by step
4. **Verify:** Run tests, review diff

```
# Automated handoff
/subagent explore /read src/**/*.ts /glob **/*.ts
  → produce plan.md
/subagent build Read plan.md and implement it
```

---

## 4. Custom Agents for Legacy Code Migration

Legacy migrations are repetitive, rule-based, and perfect for automation.

### 4.1 Migration Agent Template

Create `.mtc/agents/migration-specialist.md`:

```markdown
---
name: Migration Specialist
mode: subagent
permissions:
  read: allow
  bash: allow
  edit: deny
  execute: deny
---

You are a migration specialist. Your task is to analyze legacy code
and produce migration scripts. You do NOT modify files directly.

Rules:
- Generate /write commands for the user to review and execute.
- Flag any ambiguous patterns for human decision.
- Include a rollback plan with each migration.
```

### 4.2 Migration Workflow

1. **Scan** with Explore agent:
   ```
   /subagent explore Glob for all files using legacy-pattern
   ```

2. **Analyze** with custom migration agent:
   ```
   /subagent migration-specialist
     Read the matched files and produce a migration plan
     Mapping: {legacy API} → {new API}
   ```

3. **Execute** with Build agent:
   ```
   /subagent build Execute the migration plan from plan.md
   ```

4. **Verify** with Plan agent:
   ```
   /subagent plan Verify migration complete, all tests pass
   ```

### 4.3 Concrete Example: jQuery to Vanilla JS

**Scan phase:**
```
/subagent explore /glob **/*.js
  Grep for $.ajax, $(document).ready, $().on
```

**Migration rules in `.mtc/rules/jquery-migration.md`:**
```markdown
## jQuery Migration Rules

| jQuery Pattern | Vanilla Replacement |
|----------------|-------------------|
| `$(document).ready(fn)` | `document.addEventListener('DOMContentLoaded', fn)` |
| `$.ajax(opts)` | `fetch(url, opts)` |
| `$el.on(ev, fn)` | `el.addEventListener(ev, fn)` |
| `$el.addClass(c)` | `el.classList.add(c)` |

Files to exclude: vendor/jquery.js, tests/lib/
Maximum files per batch: 10
```

**Execute:**
```
/subagent build /read .mtc/rules/jquery-migration.md
  Apply the migration rules to all files in src/legacy/
  Process 10 files at a time.
  After each batch, run tests.
```

---

## 5. Prompt Engineering Patterns

### 5.1 Chain-of-File Commands

Instead of one massive prompt, chain file operations:

```
# Effective
/read src/config.ts
/read src/types.ts
/edit src/config.ts {old} {new}
/edit src/types.ts {old} {new}
/run_bash npm test

# Ineffective (too much in one go)
/edit src/config.ts ... /edit src/types.ts ...
```

### 5.2 Progressive Refinement

Start broad, then narrow:

```
# Round 1: Explore
/subagent explore /read src/services/auth.ts

# Round 2: Plan
/subagent plan /read src/services/auth.ts
  I want to add rate limiting. Suggest implementation.

# Round 3: Build
/subagent build /read plan.md Implement the rate limiting.
```

### 5.3 Adding Constraints

Be explicit about what the agent should NOT do:

```
Refactor the payment flow.

Do NOT:
- Change the database schema
- Modify error messages returned to the client
- Add new dependencies
- Remove existing tests
```

### 5.4 Agent-Specific Instructions

Use `.mtc/rules/` to set persistent project-wide expectations.

Example `.mtc/rules/team-practices.md`:
```markdown
## Team Practices
- All new functions must have JSDoc.
- Use `const` over `let` unless rebinding.
- Prefer async/await over raw promises.
- Keep files under 400 lines.
```

---

## 6. Performance Tips

| Practice | Why |
|----------|-----|
| Point to specific files with `/read` | Reduces context used by glob/search |
| Use `/glob` before `/read` to narrow scope | Avoids reading irrelevant files |
| Run `/bash npm test` to gate progress | Catches breakage early |
| Use `mtc review --files <changed>` before PR | Catches secrets/style issues |
| Split large refactors into <5 file batches | Stays within token context limits |
| Keep `.mtc/rules/` files under 5KB each | Rules compete with task context |

---

## 7. Troubleshooting

### Agent produces wrong output

```
1. Check if the prompt is ambiguous — clarify the before/after.
2. Use Plan mode first to verify the agent understands the goal.
3. Add more constraints (what NOT to do).
4. Use smaller file batches.
```

### Tool execution fails

```
1. Check permissions — does the agent have access?
2. Check file paths — relative to project root.
3. Check bash commands — mtc uses Bun shell on Windows.
```

### Token limit reached

```
1. Reduce scope — focus on one module at a time.
2. Use `/glob` to identify specific files instead of broad searches.
3. Split into multiple sessions.
```

---

## 8. Quick Reference Card

```
╔═══════════════════════════════════════════════════════════╗
║                    MTC Quick Reference                    ║
╠═══════════════════════════════════════════════════════════╣
║ Tab         — Switch agents                              ║
║ Ctrl+P      — Command palette                            ║
║ Esc         — Go back                                    ║
║                                                          ║
║ /read       — Read file contents                         ║
║ /write      — Write a file                               ║
║ /edit       — Search-and-replace in a file               ║
║ /bash       — Run a shell command                        ║
║ /glob       — Search files by pattern                    ║
║ /call       — Call any registered tool                   ║
║ /subagent   — Delegate to another agent                  ║
║ /list-tools — List available tools                       ║
║ /history    — View session history                       ║
║                                                          ║
║ mtc init    — Scaffold project config                    ║
║ mtc review  — Run SQA compliance checks                  ║
║ mtc serve   — Start WebSocket server (for VS Code)       ║
║ mtc analytics — View usage and cost dashboard            ║
╚═══════════════════════════════════════════════════════════╝
```
