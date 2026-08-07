# Before You Start

Welcome! This project is a production-grade, terminal-first AI coding assistant. By the end of your OJT, you will understand how an AI agent reads your codebase, uses tools with permission checks, routes tasks to LLMs, and collaborates with you in real time — all from your terminal.

---

## What is an Agentic Coding Assistant?

An **agentic coding assistant** is an AI system that can interact with your development environment autonomously. Instead of just answering questions, it can:

1. **Read and edit files** in your project
2. **Run bash commands** to execute builds, tests, or git operations
3. **Search your codebase** using glob and grep
4. **Use external tools** via the Model Context Protocol (MCP)
5. **Remember context** across turns using conversation history and session summaries

Think of it like a senior engineer sitting next to you: you ask it to refactor a function, it reads the code, makes edits, runs the tests, and shows you a diff to review.

---

## What This Project Does

MetaTeam Code Agent (`mtc`) runs as an interactive terminal UI (TUI) built with Ink (React for CLIs). It lets engineers:

- Chat with multiple LLM providers (DeepSeek, OpenAI, Anthropic, OpenRouter, local llama.cpp)
- Switch between built-in and custom agents (e.g., QA Tester, DevOps Engineer, Product Manager)
- Use 12+ built-in tools with granular permissions per agent
- Run headless webhook daemons that auto-fix bugs and open draft PRs
- Collaborate in real-time via shared sessions
- Extend functionality with MCP servers and custom plugins

Example flow:
1. You open `mtc` in your terminal
2. You select an agent (or use the default)
3. You ask: "Refactor the authentication middleware to use JWT"
4. The agent reads the file, edits it, runs `npm test`, and shows you a diff
5. You accept or revert the changes

---

## The Core Components

This project is organized into distinct layers. Understanding what each layer does is fundamental.

| Component | Purpose | Key Technology |
|-----------|---------|----------------|
| **CLI Layer** | Parses commands, dispatches to TUI or headless modes | Commander.js |
| **TUI Layer** | Interactive terminal UI with agent loop, permissions, and overlays | Ink + React 19 |
| **Agent Layer** | Manages built-in/custom agents, rules, subagents, and permissions | TypeScript classes |
| **Tool Layer** | 12+ built-in tools (file, bash, websearch, git, etc.) + plugin hooks | Zod validation |
| **LLM Layer** | Provider abstraction, task classification, routing, and fallback | OpenAI-compatible API |
| **MCP Layer** | Loads external tools from Model Context Protocol servers | stdio/HTTP MCP clients |
| **Session Layer** | Conversation history, file patches, token budgets, summaries | SQLite |
| **Daemon Layer** | Headless webhook server with autofix pipeline | Bun.serve + GitHub/GitLab |
| **Enterprise Layer** | Licensing, SSO, RBAC, audit logs, org management, dashboard | Proprietary modules |
| **Server Layer** | WebSocket server for VS Code extension integration | Bun WebSocket |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.2+ |
| Language | TypeScript 7 (strict mode, ESNext, React JSX) |
| TUI Framework | Ink 7 + React 19 + @inkjs/ui |
| CLI Framework | Commander.js 15 |
| Validation | Zod 3 |
| State / Sessions | SQLite |
| Editor Integration | VS Code extension (WebSocket) |
| CI/CD | GitHub Actions |

---

## Prerequisites

Before starting, make sure you have:
- **Bun** v1.2 or later (https://bun.sh)
- **Git**
- **Node.js** 18+ (for VS Code extension)
- A code editor (VS Code recommended)
- Basic familiarity with TypeScript, REST APIs, and terminal commands

---

## Quick Setup

### 1. Install the CLI

```bash
# From npm
npm install -g @metateam/cli
mtc --version
```

Or build from source:

```bash
git clone git@github.com:mtm-LazumLyntonTawngYung/metateam-code-agent.git
cd metateam-code-agent
bun install
bun run build
```

### 2. Start the TUI

```bash
mtc
```

This launches the interactive terminal UI. Use `Tab` to switch agents, `Ctrl+P` or `/` for commands.

### 3. Configure an LLM Provider

```bash
mtc llm status
mtc llm set-provider --id deepseek --key sk-...
mtc llm set-routing --simple deepseek-chat --default deepseek-chat --reasoning claude-sonnet-4-20250514
```

### 4. Start the WebSocket Server (for VS Code)

```bash
mtc serve [-p 8080] [-H 127.0.0.1] [-t ws-token]
```

### 5. Start the Daemon (for GitHub webhooks)

```bash
mtc daemon [-p 8080] [-H 0.0.0.0] [-s secret] [-t github-token] [--slack-webhook] [--teams-webhook]
```

---

## Verify It Works

1. Run `mtc` and ensure the TUI opens
2. Press `Tab` to confirm agent switching works
3. Press `Ctrl+P` to confirm the command palette opens
4. Type a simple question and verify you get a streaming response
5. Run `mtc llm status` to confirm your provider is configured
6. If using VS Code, run `mtc serve` and connect from the extension

If this works, the project is ready for learning.

---

## Your First Task

**Trace one complete interaction from TUI input to LLM response.**

Open these files and map the flow:
1. `src/cli.tsx` — CLI entry point and command dispatch
2. `src/ui/App.tsx` — Main TUI app and agent loop
3. `src/agents/index.ts` — Agent initialization and switching
4. `src/tools/index.ts` — Tool registry and permission checks
5. `src/llm/index.ts` — LLM provider abstraction and routing

Draw a diagram on paper or a whiteboard showing:
- What happens when you press Enter in the TUI
- How tools are selected and permission-checked
- How the LLM response streams back to the UI
- Where sessions are persisted

After you can explain this flow without looking at the code, move on to `docs/AGENT_PIPELINE_EXPLAINED.md`.
