# MTC Internal Workshop

**Goal:** Enable every MetaTeam engineer to use mtc effectively in their
daily workflow.

**Format:** 2-hour hands-on session

---

## Agenda

### Part 1: Introduction (15 min)

| Topic | Duration |
|-------|----------|
| What is mtc? | 5 min |
| How it differs from autocomplete tools | 5 min |
| Demo: Live refactoring session | 5 min |

### Part 2: Setup & First Session (20 min)

Walk through the [Onboarding Guide](../internal/onboarding.md) together:

```
1. Clone repo & install
2. Configure API key
3. Run `mtc`
4. First command: /read README.md
5. First agent switch: Tab key
```

### Part 3: Plan/Build Workflow (25 min)

**Exercise:** Refactor a module

1. **Plan:** Explore the module, identify improvement areas
2. **Build:** Implement the changes
3. **Verify:** Run tests, review diff

**Prompt templates provided** (see [Playbook](../playbook.md)).

### Part 4: Custom Agents (20 min)

**Exercise:** Create a custom subagent

1. Create `.mtc/agents/my-agent.md`
2. Define permissions and system prompt
3. Test with `/subagent`

### Part 5: MCP Plugins (20 min)

**Exercise:** Connect an MCP plugin

1. Review the [MCP Plugin Scaffold](../templates/mcp-plugin-scaffold.ts)
2. Register in `.mtc/mcp.json`
3. Call tools via `/call`

### Part 6: Q&A and Office Hours (20 min)

Open floor for questions, troubleshooting, and advanced use cases.

---

## Materials

- **Prerequisites:** Bun installed, GitHub access
- **Handouts:** [Quick Reference Card](../playbook.md#8-quick-reference-card)
- **Slides:** Available on the internal wiki
- **Sample project:** `mtc-workshop-demo` repo

## Follow-Up

- Slack channel: #mtc-users
- Office hours: Wednesdays 2pm ET
- [Internal Docs](../internal/README.md)
