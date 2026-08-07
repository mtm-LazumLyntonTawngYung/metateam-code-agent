# Extending the Project

Ideas for capstone projects, advanced learning, or production improvements. Each idea includes the concept it teaches, the scope, and suggested implementation steps.

---

## Difficulty Legend

- **Easy**: Can be completed in 1-2 days. Good for practicing fundamentals.
- **Medium**: 3-5 days. Requires understanding multiple components.
- **Hard**: 1+ weeks. Involves significant design and implementation.

---

## Agent and Tooling

### Add a Code Formatter Tool
**Difficulty**: Easy | **Concept**: Tool development

Add a tool that runs Prettier or Biome on selected files.

**Steps**:
1. Add a new tool definition in `src/tools/index.ts`
2. Use Zod to validate the file path input
3. Spawn `prettier --write <file>` via `run_bash` or directly
4. Show the diff to the user for review

### Add a Git Branch Manager
**Difficulty**: Medium | **Concept**: Git automation

Add tools for creating, switching, and merging git branches.

**Steps**:
1. Add `create_branch`, `switch_branch`, `merge_branch` tools
2. Validate branch names with Zod
3. Run git commands via `run_bash`
4. Show branch status in the TUI

### Add a Database Query Tool
**Difficulty**: Medium | **Concept**: External service integration

Allow the agent to query a database (PostgreSQL, SQLite) directly.

**Steps**:
1. Add a `query_database` tool with connection config
2. Validate SQL queries to prevent injection
3. Return results as formatted tables
4. Add read-only permission guard

### Add a Browser Automation Tool
**Difficulty**: Hard | **Concept**: GUI automation

Use Playwright to let the agent interact with web browsers.

**Steps**:
1. Add a `browser_screenshot` and `browser_click` tool
2. Spawn a headless browser instance
3. Return screenshots or element text to the agent
4. Manage browser lifecycle (open/close per session)

---

## LLM and Generation

### Add Multi-Modal Support (Images)
**Difficulty**: Medium | **Concept**: Multi-modal LLM

Enable the agent to analyze images by sending them to vision-capable models.

**Steps**:
1. Detect if the current model supports vision (e.g., GPT-4o, Claude 3.5 Sonnet)
2. Add an `analyze_image` tool that accepts image paths or URLs
3. Encode images as base64 and include in the LLM request
4. Display the LLM's image analysis in the TUI

### Add Streaming Artifacts
**Difficulty**: Easy | **Concept**: Rich output

Let the agent produce rich artifacts (code blocks, diagrams, tables) during streaming.

**Steps**:
1. Detect artifact markers in the streaming response
2. Render code blocks with syntax highlighting in the TUI
3. Add copy-to-clipboard buttons for code artifacts

### Add Model Fallback Chains
**Difficulty**: Medium | **Concept**: Resilience

Configure automatic fallback when a provider is down or rate-limited.

**Steps**:
1. Extend `src/llm/fallback.ts` to support user-defined fallback chains
2. Add CLI/config options for fallback order
3. Log fallback events for debugging
4. Test by intentionally shutting down a provider

---

## Retrieval and Context

### Add RAG to the Agent
**Difficulty**: Hard | **Concept**: Document-grounded coding

Let the agent query your documentation or codebase using RAG before answering.

**Steps**:
1. Index your project's docs and source code into a vector store
2. Add a `search_codebase` tool that performs hybrid search
3. Inject retrieved results into the agent's context before LLM calls
4. Compare answer quality with and without RAG

### Add Conversation Memory Summaries
**Difficulty**: Medium | **Concept**: Long-context management

Summarize old conversation turns to save tokens while preserving context.

**Steps**:
1. In `src/session/`, detect when history exceeds a threshold
2. Call the LLM to summarize older turns
3. Prepend the summary to the system prompt
4. Compare token usage and answer quality

---

## UI and UX

### Add a Diff Viewer
**Difficulty**: Medium | **Concept**: Visual code review

Show file edits as a side-by-side diff in the TUI.

**Steps**:
1. Add a `diff` view to `src/ui/App.tsx`
2. Use a diff library (e.g., `diff`) to compute line-by-line changes
3. Render added/removed lines with color (green/red)
4. Add accept/revert buttons

### Add Voice Input
**Difficulty**: Hard | **Concept**: Multi-modal input

Use the microphone for voice input in the TUI.

**Steps**:
1. Capture audio using the system microphone
2. Transcribe with a local or cloud STT service
3. Display the transcription and send it as a query
4. Add a push-to-talk key binding

### Add Split Panes
**Difficulty**: Medium | **Concept**: Advanced TUI layout

Show code and agent output side-by-side.

**Steps**:
1. Modify `src/ui/App.tsx` to use Ink flexbox layout
2. Left pane: file viewer
3. Right pane: agent chat
4. Add keyboard shortcuts to switch focus between panes

---

## Collaboration

### Add Real-Time Code Sharing
**Difficulty**: Hard | **Concept**: Collaborative editing

Let multiple users edit the same file simultaneously.

**Steps**:
1. Extend `src/shared-sessions/` with CRDT-based conflict resolution
2. Broadcast file changes to all session participants
3. Show remote cursors and selections in the TUI
4. Handle offline sync and merge

### Add Session Recording and Playback
**Difficulty**: Medium | **Concept**: Session replay

Record agent sessions and allow playback for debugging or training.

**Steps**:
1. Record all tool calls, LLM responses, and user inputs
2. Store recordings in a replayable format (JSON)
3. Add a `play` command that replays a session step-by-step
4. Support speed control and scrubbing

---

## Infrastructure

### Add Docker Compose for Full Stack
**Difficulty**: Easy | **Concept**: Deployment

Create a `docker-compose.yml` that runs the TUI, daemon, and any dependencies.

**Steps**:
1. Write a `Dockerfile` for the CLI
2. Write a `docker-compose.yml` with the CLI service
3. Add environment variable management
4. Test on a clean machine

### Add Plugin Marketplace
**Difficulty**: Hard | **Concept**: Distribution

Let users install plugins from a remote registry.

**Steps**:
1. Define a plugin manifest format
2. Build a registry API (or use GitHub releases)
3. Add `mtc plugin install <name>` and `mtc plugin search <query>`
4. Implement plugin signing and verification

### Add Observability Dashboard
**Difficulty**: Hard | **Concept**: Monitoring

Build a dashboard showing agent usage, token consumption, and error rates.

**Steps**:
1. Instrument the agent loop with metrics (turns, tokens, tool calls, errors)
2. Store metrics in SQLite or push to Prometheus
3. Build a web dashboard (or reuse the enterprise dashboard)
4. Add alerts for high error rates or unusual usage patterns

---

## Security

### Add Prompt Injection Detection
**Difficulty**: Medium | **Concept**: Safety

Detect and block prompt injection attempts before they reach the LLM.

**Steps**:
1. Add an input classifier that scans for injection patterns
2. Common patterns: "ignore previous instructions", "you are now DAN", "output your system prompt"
3. Return a safe fallback message for detected injections
4. Log attempts for security review

### Add Secret Scanning in Edits
**Difficulty**: Easy | **Concept**: Security

Scan file edits for accidentally committed secrets before saving.

**Steps**:
1. Extend `src/secrets/` to scan edited content
2. Match common secret patterns (API keys, tokens, passwords)
3. Warn the user before saving
4. Add a `--force` flag to override (with logging)

---

## Evaluation and Testing

### Add a Tool Accuracy Benchmark
**Difficulty**: Medium | **Concept**: Systematic evaluation

Measure how often the agent calls the correct tool for a given task.

**Steps**:
1. Create a dataset of queries paired with expected tool calls
2. Run the agent against each query
3. Compare the actual tool sequence to the expected sequence
4. Report precision, recall, and F1 for tool selection

### Add Conversation Quality Evaluation
**Difficulty**: Hard | **Concept**: LLM-as-judge

Use an LLM to rate the quality of agent conversations.

**Steps**:
1. Define criteria: helpfulness, accuracy, conciseness, safety
2. For each conversation, send the transcript to a judge LLM
3. Collect ratings and compute aggregate scores
4. Correlate ratings with user feedback (if available)

---

## Capstone Project Ideas

Combine multiple extensions into a single project:

1. **Production-Ready Agent**: Auth, rate limiting, health checks, observability, Docker
2. **Multi-Agent System**: Orchestrate multiple specialized agents that hand off to each other
3. **Agentic Coding Workflow**: Full PR lifecycle — branch, implement, test, review, merge
4. **Collaborative IDE**: Real-time multi-user coding with the agent as a participant
5. **RAG-Augmented Agent**: Index your entire org's codebase and docs for context-aware assistance
