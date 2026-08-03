# Command Reference

Complete reference for **mtc** CLI commands, slash commands, and key bindings.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `mtc` | Start the interactive TUI |
| `mtc eval list` | List available eval tasks (`tests/evals/`) |
| `mtc eval run <name> [-s <solution>]` | Run an eval task in an isolated sandbox |
| `mtc init [dir]` | Scaffold `.mtc/` project configuration |
| `mtc review [-d <dir>] [-f <files...>] [-v] [--json]` | Run SQA compliance checks on a project |
| `mtc llm status` | Show configured LLM providers and routing |
| `mtc llm set-provider` | Add or update an LLM provider (`-i <id> -k <key> [-u <url> -m <models...>]`) |
| `mtc llm set-routing` | Set routing models (`-s <simple> -d <default> -r <reasoning>`) |
| `mtc llm classify <query>` | Test task classification and model routing |
| `mtc llm models` | List all known models |
| `mtc analytics report [-d <days>]` | Show usage analytics report |
| `mtc analytics enable` | Enable telemetry |
| `mtc analytics disable` | Disable telemetry |
| `mtc analytics status` | Show telemetry status and device ID |
| `mtc serve [-p <port>] [-H <host>] [-t <token>]` | Start headless WebSocket server (for the VS Code extension) |
| `mtc daemon` | Start the autonomous webhook/autofix daemon |
| `mtc enterprise status` | Show license tier and feature availability |
| `mtc enterprise activate <key>` | Activate an enterprise license key |
| `mtc enterprise deactivate` | Deactivate and revert to community tier |
| `mtc enterprise generate` | Generate a license key (`-t <tier> -o <org>`) |
| `mtc enterprise dashboard` | Start the web control-plane dashboard |
| `mtc enterprise audit` | Query audit logs (`-l <count> -a <actor> -s <since>`) |
| `mtc enterprise org list\|create` | Manage organizations |
| `mtc auth logout` | Clear the SSO session |
| `mtc --version` | Print version |
| `mtc --help` | Print help |

See [Daemon & Autonomous Mode](./daemon.md) for `mtc daemon` options and
[Commercialization](./commercialization.md) for the enterprise commands.

## Slash Commands (TUI)

Typed in the Home input box or the chat input. Anything starting with `/`
that isn't recognized below opens the command palette.

### App-Level Commands

| Command | Action |
|---------|--------|
| `/connect` | Open the provider setup form (add an AI provider) |
| `/agents` | Open the agent selector |
| `/diff` | Open the git diff viewer |
| `/editor` | Open `$EDITOR` (default `code`) in the current directory |
| `/help` | Show the help overlay |
| `/init` | Run the agent to scaffold `AGENTS.md` + `.mtc/` in the current directory |
| `/logout` | Clear SSO authentication and return home |
| `/mcps` | Open the MCP server manager |
| `/model` or `/models` | Open the model picker |
| `/move <path>` | Change the working directory |
| `/new` | Create a new session |
| `/review` | Run `mtc review` on the current directory and print findings |
| `/sessions` or `/session` | Open the session list |
| `/skills` | Open the skills browser |
| `/status` | Print system status (tier, license, MCP, features) |
| `/themes` | Open the theme picker |
| `/variants` | Open the model-variant selector |
| `<skill-id>` | Run an installed skill (e.g. `/tdd`) |
| anything else starting with `/` | Open the command palette |

### Tool Commands (Chat Input)

| Command | Tool | Description |
|---------|------|-------------|
| `/read <path> [offset] [limit]` | `read_file` | Read a file |
| `/write <path> <content>` | `write_file` | Write content to a file |
| `/edit <path> <target> <replacement>` | `edit_file` | Search-and-replace in a file |
| `/bash <command>` | `run_bash` | Run a shell command |
| `/glob <pattern> [path]` | `glob_files` | Search files by glob pattern |
| `/call <tool> {jsonArgs}` | any registered tool | Call any registered tool, including MCP tools |
| `/subagent <name> <commands...>` | — | Delegate tool commands to another agent |

Usage: `/read path [offset] [limit] | /write path content | /edit path target replacement | /bash cmd | /glob pattern | /call toolName {jsonArgs} | /subagent name /read ...`

## Key Bindings

| Key | Action |
|-----|--------|
| `Tab` | Open the agent selector |
| `Ctrl+P` / `/` | Open the command palette |
| `Esc` | Close the topmost overlay; otherwise back to home |
| `↑` / `↓` | Navigate command history / partial history search |
| `PageUp` / `PageDown` | Scroll by one viewport |
| `Home` / `End` | Jump to top / bottom of the log |
| `Enter` | Submit input / select a list entry |
| `d` | Delete the highlighted session (Sessions view) |
| `Space` | Toggle an MCP server (MCP view) |
| `y` / `n` / `a` | Accept / reject / always-allow a tool permission prompt |
| `←` / `→` | Switch file (diff viewer) |
| Mouse wheel | Scroll the chat log and diff viewer |
| `s` / `r` / `q` | Skip / retry / quit (SSO login screen) |

## Agent Permissions

Agents declare four tool permissions, each `allow` or `deny`. Denied tools
are skipped; allowed tools run directly (sensitive ones still prompt).

| Permission | Plan | Build | Explore | Custom |
|------------|------|-------|---------|--------|
| `read` | Allow | Allow | Allow | Configurable |
| `edit` | Deny | Allow | Deny | Configurable |
| `bash` | Deny | Allow | Deny | Configurable |
| `execute` | Allow | Allow | Deny | Configurable |

Built-in agents: **Build** (full access), **Plan** (read-only architect),
**Explore** (read/glob-only subagent). Custom agents are defined in
`.mtc/agents/*.md` — see [Configuration](./configuration.md).
