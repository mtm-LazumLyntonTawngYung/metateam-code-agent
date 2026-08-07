# Learning Roadmap

A 6-week guided plan for learning the MetaTeam Code Agent. Each week builds on the previous one. Complete the exercises in `docs/EXERCISES.md` alongside the weekly tasks.

---

## Prerequisites

Before starting, ensure you are comfortable with:
- TypeScript basics (types, functions, async/await)
- Terminal/command line usage
- Basic HTTP and WebSocket concepts
- Git basics (clone, branch, commit, push)
- Bun runtime and package management

Familiarity with React and LLM APIs is helpful but not required — you will learn them as you go.

---

## Week 1: Orientation and Setup

**Goal**: Get the project running and understand the big picture.

### Day 1-2: Environment Setup
- Follow `docs/BEFORE_YOU_START.md` to install Bun and the CLI
- Build from source with `bun install && bun run build`
- Verify `mtc --version` works
- Start the TUI and confirm it renders

### Day 3-4: Architecture Overview
- Read `docs/AGENT_PIPELINE_EXPLAINED.md`
- Draw the full architecture diagram on paper
- Identify the core components (CLI, TUI, Agent, Tools, LLM, Session, Daemon)
- Trace one interaction from TUI input to LLM response through the code

### Day 5: First Code Reading
- Open `src/cli.tsx` — understand how Commander.js dispatches commands
- Open `src/ui/App.tsx` — identify the main views and overlays
- Read `src/agents/index.ts` — understand agent initialization and switching

### Checkpoint
You should be able to explain:
- What MetaTeam Code Agent does in 2-3 sentences
- The difference between the TUI, daemon, and server modes
- How an agent, a tool, and an LLM interact during one turn
- How to run the project and verify it works

---

## Week 2: Agents and Permissions

**Goal**: Understand how agents work and how permissions control their behavior.

### Topics
- Agent definitions (system prompts, permissions)
- Built-in vs custom agents
- Permission levels (`allow`, `ask`, `deny`)
- Agent switching in the TUI
- Rules and frontmatter

### Tasks
1. Read `docs/CODE_WALKTHROUGH.md` sections on `src/agents/` and `src/tools/`
2. Complete **Exercises 1 and 2** in `docs/EXERCISES.md` (default agent and custom agent)
3. Experiment: Create three agents with different permission sets (read-only, balanced, unrestricted)
4. Test each agent on the same task and compare behavior

### Checkpoint
You should be able to:
- Explain what an agent is and what its system prompt controls
- Describe the four permission levels
- Create a custom agent from a Markdown file
- Predict how permission restrictions affect agent behavior

---

## Week 3: Tools and Plugins

**Goal**: Understand how tools extend the agent's capabilities.

### Topics
- Built-in tools (file, bash, websearch, git, etc.)
- Zod schemas for input validation
- Permission checks before tool execution
- Plugin system and dynamic tool registration
- MCP integration for external tools

### Tasks
1. Read `docs/CODE_WALKTHROUGH.md` section on `src/tools/`
2. Complete **Exercise 3** in `docs/EXERCISES.md` (add a new tool)
3. Study `src/plugins/index.ts` and `examples/plugins/hello.ts`
4. Create a simple plugin that registers a custom tool

### Checkpoint
You should be able to:
- List all 12+ built-in tools and describe what each does
- Explain how Zod schemas validate tool inputs
- Add a new tool to the registry
- Explain the difference between built-in tools and MCP/plugin tools

---

## Week 4: LLM Providers and Routing

**Goal**: Understand how the agent connects to and uses LLMs.

### Topics
- Provider abstraction (DeepSeek, OpenAI, Anthropic, OpenRouter, llama.cpp)
- Task classification and model routing
- Fallback chains for resilience
- Streaming responses
- Token usage and cost management

### Tasks
1. Read `docs/CODE_WALKTHROUGH.md` section on `src/llm/`
2. Complete **Exercises 4, 5, and 6** in `docs/EXERCISES.md`
3. Configure two providers and compare response quality and latency
4. Add temporary logging to `src/llm/router.ts` to see routing decisions

### Checkpoint
You should be able to:
- Explain the three routing tiers (simple, default, reasoning)
- Configure a new LLM provider via the CLI
- Explain why fallback chains are important
- Compare streaming vs non-streaming responses

---

## Week 5: Sessions, MCP, and Collaboration

**Goal**: Understand state management, external tool integration, and multi-user support.

### Topics
- Session persistence (SQLite)
- Conversation history and file patches
- MCP server discovery and tool registration
- Shared sessions and real-time collaboration
- VS Code extension via WebSocket

### Tasks
1. Read `docs/CODE_WALKTHROUGH.md` sections on `src/session/`, `src/mcp/`, `src/shared-sessions/`, and `src/server/`
2. Complete **Exercises 7, 8, and 10** in `docs/EXERCISES.md`
3. Connect the VS Code extension to `mtc serve` and compare with the TUI
4. Start a shared session and test collaboration features

### Checkpoint
You should be able to:
- Explain what a session stores and how it persists
- Configure an MCP server and verify its tools appear
- Describe the WebSocket protocol between the extension and server
- List the key features of shared sessions

---

## Week 6: Daemon, Enterprise, and Advanced Topics

**Goal**: Understand headless operation, enterprise features, and production concerns.

### Topics
- Webhook daemon (GitHub/GitLab)
- Autofix pipeline (clone → analyze → fix → test → push → PR)
- Enterprise features (licensing, SSO, RBAC, audit, dashboard)
- Security practices (webhook validation, path traversal, secret redaction)
- Evaluation and benchmarking

### Tasks
1. Read `docs/CODE_WALKTHROUGH.md` sections on `src/daemon/`, `src/enterprise/`, and `src/review/`
2. Complete **Exercises 9, 11, and 12** in `docs/EXERCISES.md`
3. Run `mtc eval bench` and analyze results
4. Read `docs/EXTENDING_THE_PROJECT.md` and pick one feature to prototype

### Checkpoint
You should be able to:
- Explain how the daemon receives and processes webhooks
- Describe the autofix pipeline stages
- Explain enterprise licensing and tier gating
- List at least 3 security measures in the project
- Run and interpret evaluation benchmarks

---

## Final Assessment

After completing all 6 weeks, you should be able to answer these questions without referring to notes:

1. What is an agentic coding assistant, and how does it differ from a chatbot?
2. Walk through the complete agent loop from user input to tool execution to LLM response.
3. How do permissions restrict what an agent can do, and why is this important?
4. What is the difference between a built-in tool, an MCP tool, and a plugin tool?
5. How does the LLM router decide which model to use for a given query?
6. What is the purpose of the daemon, and how does the autofix pipeline work?
7. How does the VS Code extension communicate with the agent?
8. What security measures protect against webhook spoofing and path traversal?
9. How would you add support for a new LLM provider?
10. What would you change if you had to support 10,000 concurrent agent sessions?

---

## If You Finish Early

If you complete the roadmap ahead of schedule:
1. Implement 3 exercises from `docs/EXERCISES.md` that you skipped
2. Build one feature from `docs/EXTENDING_THE_PROJECT.md`
3. Write a short blog post or internal doc explaining one agent concept you learned
4. Profile the agent loop and write a performance analysis with recommendations
5. Run the full test suite and fix any flaky or missing tests
