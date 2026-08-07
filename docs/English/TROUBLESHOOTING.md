# Troubleshooting

Common issues you will encounter while learning and working with this project. Each entry describes the symptom, likely cause, and fix.

---

## Setup Issues

### "bun: command not found"

**Symptom**: The shell cannot find the `bun` command.

**Causes and fixes**:
1. **Bun is not installed**: Download from https://bun.sh and install
2. **Bun is not on PATH**: Restart your terminal or add Bun to your PATH
   ```bash
   # macOS / Linux
   export PATH="$HOME/.bun/bin:$PATH"
   
   # Windows (PowerShell)
   $env:PATH += ";$env:USERPROFILE\.bun\bin"
   ```
3. **Wrong shell**: Use a shell that Bun supports (PowerShell 7+, bash, zsh, fish)

### "Permission denied" when running `mtc`

**Symptom**: The binary exists but cannot be executed.

**Fix**:
1. Ensure the binary has execute permissions:
   ```bash
   chmod +x bin/mtc
   ```
2. On Windows, ensure the `.ps1` execution policy allows running scripts:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

### "Cannot find module" errors after build

**Symptom**: `mtc` crashes with module not found errors.

**Causes and fixes**:
1. **Dependencies not installed**: Run `bun install` in the project root
2. **Build failed**: Check `bun run build` output for errors
3. **Wrong working directory**: Run `mtc` from the project root or ensure `bin/` is on PATH

---

## TUI Issues

### TUI renders incorrectly or shows garbled text

**Symptom**: The terminal UI looks broken, characters are misaligned, or colors are wrong.

**Causes and fixes**:
1. **Terminal too small**: Resize to at least 80x24
2. **Unsupported terminal**: Use a modern terminal (iTerm2, Windows Terminal, GNOME Terminal)
3. **Incompatible font**: Switch to a font with good Unicode and powerline support (e.g., JetBrains Mono, Fira Code)
4. **Legacy console**: On Windows, avoid `cmd.exe`; use PowerShell or Windows Terminal

### TUI freezes or becomes unresponsive

**Symptom**: The TUI stops updating or accepting input.

**Causes and fixes**:
1. **LLM provider timeout**: Check your internet connection and provider status
2. **Background task blocking**: A tool may be hanging. Press `Ctrl+C` to cancel
3. **Terminal state corrupted**: Exit and restart the TUI

### Agent does not respond to messages

**Symptom**: You type a message but get no response.

**Causes and fixes**:
1. **LLM provider not configured**: Run `mtc llm status` to check
2. **API key invalid**: Verify your key with `mtc llm set-provider`
3. **Network issue**: Check connectivity to the LLM API endpoint
4. **Rate limited**: Wait a moment and try again

---

## LLM and Provider Issues

### "401 Unauthorized" from LLM provider

**Symptom**: LLM calls fail with 401 errors.

**Fix**:
1. Verify the API key is correct: `mtc llm status`
2. Check that the key has not expired or been revoked
3. Ensure `AI_BASE_URL` is correct if using a non-standard endpoint

### "429 Too Many Requests"

**Symptom**: Rate limited by the LLM provider.

**Fix**:
1. Wait for the rate limit to reset (check the `Retry-After` header)
2. Switch to a different provider temporarily
3. Enable request caching if available
4. Reduce request frequency

### Responses are slow or timeout

**Symptom**: LLM responses take too long or never arrive.

**Causes and fixes**:
1. **Network latency**: Check your connection to the API endpoint
2. **Model overloaded**: Try a different model or provider
3. **Large context window**: Long conversation history increases latency
4. **Provider outage**: Check the provider's status page

---

## Tool and Permission Issues

### Tool execution fails with "permission denied"

**Symptom**: The agent tries to use a tool but it is blocked.

**Causes and fixes**:
1. **Agent permissions too restrictive**: Check the agent's frontmatter in `.mtc/agents/*.md`
2. **Global permission rules**: Check `~/.config/mtc/permissions.json`
3. **User rejected the tool**: If you see a permission prompt, ensure you accepted

### `run_bash` returns unexpected output

**Symptom**: Bash commands produce errors or unexpected results.

**Causes and fixes**:
1. **Wrong working directory**: Check the agent's current directory (`pwd`)
2. **Missing dependencies**: Ensure the command's dependencies are installed
3. **Shell syntax**: The agent uses `sh`-compatible syntax; avoid bash-specific features
4. **Environment variables**: Some commands require env vars that may not be set

### `edit_file` produces incorrect patches

**Symptom**: File edits fail or modify the wrong content.

**Causes and fixes**:
1. **Stale file content**: The file may have changed since it was read
2. **Incorrect search string**: Ensure `old` matches exactly (including whitespace)
3. **Multiple matches**: If `old` appears multiple times, specify more context
4. **File encoding**: Ensure the file is UTF-8 encoded

---

## MCP Issues

### MCP server fails to start

**Symptom**: The MCP server shows as disconnected or failed.

**Causes and fixes**:
1. **Command not found**: Ensure the MCP server binary is installed and on PATH
2. **Missing dependencies**: Run the MCP server's install command (e.g., `npx`, `npm install`)
3. **Wrong args**: Check `.mtc/mcp.json` for correct command and arguments
4. **Environment variables**: Ensure required env vars (e.g., `FIGMA_TOKEN`) are set

### MCP tools do not appear in the agent

**Symptom**: The agent cannot see or use MCP tools.

**Causes and fixes**:
1. **Server not started**: Restart `mtc` after adding the MCP config
2. **Server failed to list tools**: Check the MCP server's logs
3. **Tool name collision**: MCP tools may be shadowed by built-in tools with the same name

---

## Session and Persistence Issues

### Session history is lost after restart

**Symptom**: Previous conversations do not appear after restarting `mtc`.

**Causes and fixes**:
1. **SQLite database deleted**: Check that `~/.config/mtc/sessions.db` exists
2. **Wrong config directory**: Ensure `HOME` / `USERPROFILE` is set correctly
3. **Permission denied**: Check file permissions on the config directory

### File patches cannot be reverted

**Symptom**: `mtc session revert` fails or does not restore the file.

**Causes and fixes**:
1. **Patch file missing**: The session's patch data may have been deleted
2. **File modified externally**: If the file was changed outside the session, the patch may not apply cleanly
3. **Session expired**: Old sessions may be pruned based on retention settings

---

## Daemon Issues

### Daemon does not receive webhooks

**Symptom**: GitHub/GitLab webhooks are not triggering the daemon.

**Causes and fixes**:
1. **Port not accessible**: Ensure the daemon port is open and not blocked by a firewall
2. **Wrong webhook URL**: Verify the webhook URL in GitHub/GitLab settings
3. **Signature validation failed**: Check `MTC_WEBHOOK_SECRET` matches the webhook secret
4. **IP not allowed**: Some providers restrict webhook source IPs

### Autofix pipeline hangs or fails

**Symptom**: The daemon starts but the autofix pipeline does not complete.

**Causes and fixes**:
1. **Git clone failed**: Check `MTC_GITHUB_TOKEN` has repo access
2. **LLM call failed**: Check provider configuration and API keys
3. **Tests failed**: The fix may have broken existing tests; check logs
4. **Push failed**: Ensure the token has write access to the repo

### Daemon logs show "path traversal" errors

**Symptom**: File operations in the autofix pipeline are blocked.

**Fix**: This is a security feature. The daemon validates that all file paths are within the cloned repository. If you see this error, check that the LLM-generated fix does not reference paths outside the repo.

---

## VS Code Extension Issues

### Extension cannot connect to server

**Symptom**: The extension shows "Connection failed" or "Disconnected".

**Causes and fixes**:
1. **Server not running**: Start `mtc serve` before connecting
2. **Wrong port or token**: Verify `-p` and `-t` flags match the extension settings
3. **Firewall blocking**: Ensure the WebSocket port is accessible
4. **Version mismatch**: Ensure the extension and CLI are compatible versions

### Extension sidebar is empty

**Symptom**: The sidebar webview loads but shows no content.

**Causes and fixes**:
1. **No active session**: Start a conversation in the TUI or via the extension
2. **WebSocket disconnected**: Reconnect from the extension command palette
3. **Extension crashed**: Reload the VS Code window

---

## Performance Issues

### Agent loop is slow

**Symptom**: Each agent turn takes too long.

**Causes and fixes**:
1. **LLM latency**: Switch to a faster model or provider
2. **Too many tools**: Reduce the number of registered tools to speed up tool selection
3. **Large context**: Shorten conversation history or enable summarization
4. **Network latency**: Use a geographically closer LLM endpoint

### High memory usage

**Symptom**: `mtc` consumes excessive RAM.

**Causes and fixes**:
1. **Large conversation history**: Enable auto-summarization
2. **MCP servers leaking**: Restart `mtc` to clean up MCP processes
3. **Session database growing**: Prune old sessions with `mtc session list` and manual cleanup

---

## Build and Development Issues

### `bun run build` fails

**Symptom**: The build command produces errors.

**Causes and fixes**:
1. **TypeScript errors**: Run `bun run typecheck` to see specific errors
2. **Missing dependencies**: Run `bun install`
3. **Incompatible Bun version**: Ensure Bun >= 1.2.0

### Tests fail

**Symptom**: `bun test` produces failing tests.

**Causes and fixes**:
1. **Flaky tests**: Re-run; some tests may depend on network or timing
2. **Missing test data**: Ensure test fixtures are present
3. **Environment variables**: Some tests require `MTC_LICENSE_SECRET` or other env vars

---

## How to Inspect State

### View current configuration

```bash
mtc llm status
mtc debug info
```

### View session history

```bash
mtc session list -n 20
```

### View agent permissions

```bash
cat .mtc/agents/*.md
cat ~/.config/mtc/agents/*.md
```

### Inspect SQLite sessions database

```bash
# Find the database path
cat ~/.config/mtc/config.json | grep sessions

# Query with sqlite3
sqlite3 ~/.config/mtc/sessions.db "SELECT * FROM sessions LIMIT 10;"
```

### Check MCP server status

```bash
/mcps  # In TUI
# or
cat .mtc/mcp.json
cat ~/.config/mtc/mcp.json
```

---

## Getting Help

If you encounter an issue not covered here:
1. Check the TUI logs or run with `DEBUG=* mtc` for verbose output
2. Search the codebase for the error message
3. Check GitHub Issues at https://github.com/mtm-LazumLyntonTawngYung/metateam-code-agent/issues
4. Ask your mentor with: the error message, what you were trying to do, and what you already tried
