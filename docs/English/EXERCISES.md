# Exercises

Hands-on tasks to deepen your understanding of the MetaTeam Code Agent. Complete these in order. Each exercise has a specific concept to learn and a verifiable outcome.

---

## How to Use This Document

1. Read the concept explanation
2. Make the code change or configuration described
3. Test the change (run `mtc`, try the feature)
4. Observe and record the effect
5. Revert the change before moving to the next exercise

Keep a lab notebook (digital or paper) with:
- What you changed
- What you expected to happen
- What actually happened
- Why you think the difference occurred

---

## Exercise 1: Change the Default Agent

**Concept**: Agents define system prompts and tool permissions.

**Task**:
1. Open `src/agents/builtin.ts`
2. Find the default agent definition
3. Change the system prompt to something specific, e.g., "You are a senior TypeScript engineer. Always use strict types."
4. Restart the TUI (`mtc`)
5. Ask a question about your codebase

**Observe**:
- Does the agent's behavior change based on the new prompt?
- How does it affect the tone and specificity of responses?

**Expected outcome**: The system prompt directly shapes how the agent approaches tasks.

**Revert**: Restore the original system prompt.

---

## Exercise 2: Create a Custom Agent

**Concept**: Custom agents let you specialize behavior for different tasks.

**Task**:
1. Create `.mtc/agents/code-reviewer.md` in your project directory:
   ```markdown
   ---
   permissions:
     read: allow
     bash: deny
     edit: deny
     execute: deny
   ---

   You are a strict code reviewer. Focus on security, performance, and best practices.
   ```
2. Restart `mtc`
3. Open the agent selector (`Tab`) and select your new agent
4. Ask it to review a file in your project

**Observe**:
- Does the agent refuse to edit or run bash commands (due to permissions)?
- Is the review style different from the default agent?

**Expected outcome**: Custom agents with restricted permissions behave differently from the default agent.

---

## Exercise 3: Add a New Tool

**Concept**: Tools extend what the agent can do.

**Task**:
1. Open `src/tools/index.ts`
2. Study the existing `read_file` tool definition
3. Add a new tool called `count_lines` that returns the number of lines in a file
4. Register it in the tool registry
5. Restart `mtc` and ask the agent to count lines in a file

**Observe**:
- Does the agent discover and use your new tool?
- How does the tool schema affect how the LLM calls it?

**Expected outcome**: Adding a tool with a clear Zod schema makes it available to the agent.

---

## Exercise 4: Change the LLM Provider

**Concept**: The agent can use multiple LLM providers interchangeably.

**Task**:
1. Run `mtc llm status` to see your current provider
2. Run `mtc llm set-provider --id openai --key sk-... --url https://api.openai.com/v1 --model gpt-4o`
3. Ask the same question to both providers
4. Compare responses

**Observe**:
- Response quality differences
- Speed differences
- Cost implications

**Expected outcome**: Different providers produce different response styles and latencies for the same query.

---

## Exercise 5: Tune Model Routing

**Concept**: The LLM router classifies queries and routes them to different models.

**Task**:
1. Run `mtc llm set-routing --simple gpt-4o-mini --default gpt-4o --reasoning claude-sonnet-4-20250514`
2. Ask a simple arithmetic question (should route to `simple`)
3. Ask a code explanation question (should route to `default`)
4. Ask a complex multi-step refactoring question (should route to `reasoning`)
5. Check logs or add temporary logging to see which model was selected

**Observe**:
- Does the routing match your expectations?
- Are there cases where a simple query was sent to a reasoning model (wasteful)?

**Expected outcome**: Routing balances cost and capability by matching query complexity to model strength.

---

## Exercise 6: Enable a Local LLM

**Concept**: You can run models locally via llama.cpp for offline/private use.

**Task**:
1. Install llama.cpp and start a local server:
   ```bash
   llama-server -hf Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M --port 8080
   ```
2. Configure metateam to use it:
   ```bash
   mtc llm set-provider -i llamacpp -k dummy -u http://localhost:8080/v1 -m qwen2.5-7b-instruct
   mtc llm set-routing --default qwen2.5-7b-instruct
   ```
3. Ask questions and compare with cloud providers

**Observe**:
- Response quality compared to cloud models
- Latency on your hardware
- Memory usage

**Expected outcome**: Local models work but may have lower quality and require more setup.

---

## Exercise 7: Add an MCP Server

**Concept**: MCP servers extend the agent with external tools.

**Task**:
1. Create `.mtc/mcp.json` in your project:
   ```json
   {
     "servers": {
       "example": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-example"]
       }
     }
   }
   ```
2. Restart `mtc`
3. Open the MCP view (`/mcps`) and verify the server appears
4. Toggle it on and ask the agent to use its tools

**Observe**:
- Do the MCP tools appear in the agent's tool list?
- Does the agent use them when relevant?

**Expected outcome**: MCP servers dynamically add tools to the agent's capabilities.

---

## Exercise 8: Test Permission Prompts

**Concept**: The agent asks for permission before sensitive operations.

**Task**:
1. Open `src/agents/builtin.ts` and ensure the default agent has `bash: ask`, `edit: ask`
2. Ask the agent to run a bash command (e.g., "run `ls` in the current directory")
3. When the permission prompt appears, try `y` (accept), `n` (reject), `a` (always allow)
4. Observe how each choice affects subsequent tool calls

**Observe**:
- Does `a` (always allow) persist for the session?
- Does rejecting a tool stop the agent's workflow?

**Expected outcome**: Permission prompts give users control over what the agent can do.

---

## Exercise 9: Use the Daemon for Autofix

**Concept**: The headless daemon can auto-fix bugs and open PRs.

**Task**:
1. Set `MTC_GITHUB_TOKEN` and `MTC_WEBHOOK_SECRET` environment variables
2. Start the daemon: `mtc daemon -p 8080 -H 0.0.0.0 -s your-secret -t your-github-token`
3. Create a GitHub issue in a test repo with the label `autofix`
4. Configure the repo's webhook to point to your daemon
5. Watch the daemon clone, fix, and open a PR

**Observe**:
- How long does the autofix pipeline take?
- Does the generated fix actually work?

**Expected outcome**: The daemon demonstrates fully autonomous code repair.

---

## Exercise 10: Explore the VS Code Extension

**Concept**: The VS Code extension connects to the agent via WebSocket.

**Task**:
1. Start the WebSocket server: `mtc serve -p 8080 -t your-ws-token`
2. Open VS Code and activate the MetaTeam Code Agent extension
3. Connect the extension to the server
4. Select code in the editor and send it as a query
5. Compare the experience with the standalone TUI

**Observe**:
- Does the extension feel integrated with your editor workflow?
- What features are missing compared to the TUI?

**Expected outcome**: Editor integration enables context-aware coding assistance.

---

## Exercise 11: Run Agent Evaluation

**Concept**: Agent-driven evaluation tests the real agent loop against sandboxed tasks.

**Task**:
1. Run `mtc eval list` to see available tasks
2. Run `mtc eval run <task-id> --model gpt-4o`
3. Review the results
4. Run `mtc eval bench` to benchmark all tasks

**Observe**:
- Which tasks does the agent pass/fail?
- How does model choice affect success rate?

**Expected outcome**: Evaluation provides objective metrics for agent capability.

---

## Exercise 12: Customize a Skill

**Concept**: Skills are reusable prompt/behavior bundles.

**Task**:
1. Run `/skills` in the TUI to see available skills
2. Open a skill's `SKILL.md` file
3. Modify the skill's instructions or add a new one
4. Test the modified skill

**Observe**:
- Does the skill change the agent's behavior as expected?
- Are there side effects on other skills?

**Expected outcome**: Skills let you package and reuse agent behaviors.

---

## Bonus Challenge: Build a Plugin

**Concept**: Plugins can register tools and hooks.

**Task**:
1. Create a plugin file at `.mtc/plugins/hello.ts` (see `examples/plugins/hello.ts`)
2. Register a tool that returns a greeting
3. Restart `mtc`
4. Ask the agent to use your plugin tool

**Observe**:
- Does the plugin load without errors?
- Can the agent call your custom tool?

**Expected outcome**: Plugins enable deep customization of the agent's capabilities.

---

## Tracking Progress

Mark exercises as you complete them:

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
| Bonus | Plugin development | ☐ | |
