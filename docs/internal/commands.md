# Command Reference

Complete reference for **mtc** CLI commands and slash commands.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `mtc` | Start the interactive TUI |
| `mtc init` | Scaffold `.mtc/` project configuration |
| `mtc review` | Run SQA compliance checks on the current diff |
| `mtc serve` | Start WebSocket server (for VS Code extension) |
| `mtc analytics` | View usage and cost dashboard |
| `mtc --version` | Print version |
| `mtc --help` | Print help |

## Slash Commands (TUI)

| Command | Description |
|---------|-------------|
| `/read <path>` | Read a file or glob pattern |
| `/write <path> <content>` | Write content to a file |
| `/edit <path> <old> <new>` | Search-and-replace in a file |
| `/glob <pattern>` | Search files by glob pattern |
| `/bash <command>` | Run a shell command |
| `/call <tool> [args]` | Call any registered tool (including MCP tools) |
| `/subagent <name> <prompt>` | Delegate to another agent |
| `/list-tools` | List all available tools |
| `/history` | View session history |
| `/clear` | Clear the current conversation |

## Key Bindings

| Key | Action |
|-----|--------|
| `Tab` | Switch agents |
| `Ctrl+P` | Open command palette |
| `Ctrl+C` | Cancel current operation |
| `Ctrl+D` | Exit mtc |
| `Esc` | Go back / close overlays |
| `Up/Down` | Navigate history |
| `Enter` | Submit input |

## Agent Permissions

| Permission | Plan Agent | Build Agent | Custom |
|------------|------------|-------------|--------|
| `read` | Allow | Allow | Configurable |
| `write` | Deny | Prompt | Configurable |
| `edit` | Deny | Prompt | Configurable |
| `glob` | Allow | Allow | Configurable |
| `bash` | Allow (read-only) | Prompt | Configurable |
| `execute` | Deny | Prompt | Configurable |
