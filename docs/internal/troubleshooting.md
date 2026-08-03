# Troubleshooting Guide

Common issues and their resolutions.

---

## Installation Issues

### `bun install` fails

```
error: Cannot find module '...'
```

**Fix:** Clear cache and retry:
```bash
bun clean
rm -rf node_modules
bun install
```

### `mtc: command not found`

**Fix:** Ensure the binary is on your PATH:
```bash
# From the repo directory
export PATH="$PWD/bin:$PATH"

# Or install globally
bun link
```

## Runtime Issues

### TUI doesn't render properly

Possible causes:
- Terminal too small: Resize to at least 80x24
- Windows: Use Windows Terminal, not cmd.exe (or a terminal with SGR mouse support)
- SSH session: Ensure terminal type is `xterm-256color`

### Agent produces gibberish

1. Check your LLM API key is correct
2. Try switching to a different model
3. Reduce context size — the agent may be hitting token limits
4. Use `Plan` mode to verify the agent understands your request

### Commands timeout

```
Error: Tool call timed out after 120000ms
```

- Reduce scope — split large requests into smaller steps
- Use `/glob` before `/read` to narrow file scope
- Avoid reading very large files (>1000 lines)

### Permission prompts on every action

**Fix:** Adjust agent permissions in `.mtc/agents/<agent>.md`:

```yaml
permissions:
  edit: allow    # skip confirmation for edits
  bash: allow    # skip confirmation for bash
```

## MCP Issues

### MCP server won't connect

1. Verify the server is running: `/mcps` (shows connection state)
2. Check `.mtc/mcp.json` syntax
3. Try running the server command directly in your terminal
4. Check the server's stdout for errors

### Tool not found

```
Error: Tool not found: my_tool
```

1. Make sure the MCP server is running
2. Check the tool name matches what's registered (server-prefixed)
3. Run `/status` to confirm the server is connected

## Performance Issues

### Slow response times

- Switch to a faster LLM model
- Reduce the number of files in the session context
- Close unused tabs/panels in the TUI
- Check network latency to LLM provider

### High token usage

- Use specific file paths instead of broad globs
- Break large tasks into multiple smaller sessions
- Use `Plan` mode to narrow scope before building
- Run token audit: `mtc analytics report`

## VS Code Extension Issues

### Extension won't activate

1. Verify the VS Code extension is installed
2. Check `mtc serve` is running
3. Restart VS Code
4. Check VS Code Developer Console for errors

## Getting Help

If none of the above resolves your issue:

1. Check [FAQ](./faq.md)
2. Search GitHub Issues for similar problems
3. Ask in #mtc-users (Slack)
4. File a new GitHub Issue with:
   - `mtc --version` output
   - Steps to reproduce
   - Relevant logs or screenshots
   - Terminal type and OS version
