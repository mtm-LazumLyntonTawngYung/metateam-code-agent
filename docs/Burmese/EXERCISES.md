# Exercises (မြန်မာ)

**မြန်မာဘာသာပြန်ဆိုမှု မပြီးသေးပါ။** အင်္ဂလိပ်ဘာသာဖြင့် ရေးထားပြီး မြန်မာဘာသာပြန်ဆိုရန် လိုအပ်ပါသည်။

---

# Exercises (English Reference)

Hands-on tasks to deepen your understanding of the MetaTeam Code Agent. Complete these in order. Each exercise has a specific concept to learn and a verifiable outcome.

---

## Exercise 1: Change the Default Agent

**Concept**: Agents define system prompts and tool permissions.

**Task**:
1. Open `src/agents/builtin.ts`
2. Find the default agent definition
3. Change the system prompt to something specific
4. Restart the TUI (`mtc`)
5. Ask a question about your codebase

**Observe**: Does the agent's behavior change based on the new prompt?

---

## Exercise 2: Create a Custom Agent

**Concept**: Custom agents let you specialize behavior for different tasks.

**Task**:
1. Create `.mtc/agents/code-reviewer.md` in your project directory
2. Restart `mtc`
3. Open the agent selector (`Tab`) and select your new agent
4. Ask it to review a file in your project

---

## Exercise 3: Add a New Tool

**Concept**: Tools extend what the agent can do.

**Task**:
1. Open `src/tools/index.ts`
2. Study the existing `read_file` tool definition
3. Add a new tool called `count_lines`
4. Restart `mtc` and ask the agent to count lines in a file

---

## Exercise 4: Change the LLM Provider

**Concept**: The agent can use multiple LLM providers interchangeably.

**Task**:
1. Run `mtc llm status` to see your current provider
2. Run `mtc llm set-provider --id openai --key sk-...`
3. Ask the same question to both providers
4. Compare responses

---

## Exercise 5: Tune Model Routing

**Concept**: The LLM router classifies queries and routes them to different models.

**Task**:
1. Run `mtc llm set-routing --simple gpt-4o-mini --default gpt-4o --reasoning claude-sonnet-4-20250514`
2. Ask a simple question (should route to `simple`)
3. Ask a complex question (should route to `reasoning`)

---

## Exercise 6: Enable a Local LLM

**Concept**: You can run models locally via llama.cpp.

**Task**:
1. Start a local llama-server on port 8080
2. Configure metateam to use it
3. Ask questions and compare with cloud providers

---

## Exercise 7: Add an MCP Server

**Concept**: MCP servers extend the agent with external tools.

**Task**:
1. Create `.mtc/mcp.json` in your project
2. Restart `mtc`
3. Open the MCP view (`/mcps`) and verify the server appears

---

## Exercise 8: Test Permission Prompts

**Concept**: The agent asks for permission before sensitive operations.

**Task**:
1. Ask the agent to run a bash command
2. When the permission prompt appears, try `y`, `n`, `a`
3. Observe how each choice affects subsequent tool calls

---

## Exercise 9: Use the Daemon for Autofix

**Concept**: The headless daemon can auto-fix bugs and open PRs.

**Task**:
1. Set `MTC_GITHUB_TOKEN` and `MTC_WEBHOOK_SECRET`
2. Start the daemon: `mtc daemon -p 8080 -s your-secret -t your-github-token`
3. Create a GitHub issue with the label `autofix`
4. Watch the daemon clone, fix, and open a PR

---

## Exercise 10: Explore the VS Code Extension

**Concept**: The VS Code extension connects to the agent via WebSocket.

**Task**:
1. Start the WebSocket server: `mtc serve -p 8080 -t your-ws-token`
2. Open VS Code and connect the extension
3. Select code and send it as a query

---

## Exercise 11: Run Agent Evaluation

**Concept**: Agent-driven evaluation tests the real agent loop against sandboxed tasks.

**Task**:
1. Run `mtc eval list` to see available tasks
2. Run `mtc eval run <task-id> --model gpt-4o`
3. Run `mtc eval bench` to benchmark all tasks

---

## Exercise 12: Customize a Skill

**Concept**: Skills are reusable prompt/behavior bundles.

**Task**:
1. Run `/skills` in the TUI to see available skills
2. Open a skill's `SKILL.md` file
3. Modify the skill's instructions
4. Test the modified skill

---

## Tracking Progress

| Exercise | Concept | Status | Date |
|----------|---------|--------|------|
| 1 | Default agent | ☐ | |
| 2 | Custom agent | ☐ | |
| 3 | New tool | ☐ | |
| 4 | LLM provider swap | ☐ | |
| 5 | Model routing | ☐ | |
| 6 | Local LLM | ☐ | |
| 7 | MCP server | ☐ | |
| 8 | Permission prompts | ☐ | |
| 9 | Daemon autofix | ☐ | |
| 10 | VS Code extension | ☐ | |
| 11 | Agent evaluation | ☐ | |
| 12 | Skill customization | ☐ | |
