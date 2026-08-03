# Telemetry & Privacy Policy

**mtc** includes an optional, **opt-in** telemetry system for usage analytics.
It is disabled by default and never collects file contents, prompts, or code.

---

## Opt-In Model

Telemetry is **off unless explicitly enabled**. Enable it with:

```bash
mtc analytics enable
```

The enable command prints a full disclosure of what is collected. Disable it
at any time with:

```bash
mtc analytics disable
```

Check status with:

```bash
mtc analytics status
```

## What Is Collected

When enabled, the following events are recorded **locally** in the mtc
database:

- **Sessions**: start/end timestamps and session IDs
- **Tool calls**: tool name, success/failure, duration
- **Model usage**: model name and token counts
- **Device**: an anonymous, randomly generated device ID

## What Is Never Collected

- File contents, source code, or diffs
- Chat prompts or model responses
- Repository names or paths
- User identity or credentials

## Data Storage & Retention

All telemetry is stored locally in the mtc SQLite database. It is not sent to
any external server by default. Only a local aggregate report is produced:

```bash
mtc analytics report
```

## Privacy Guarantees

1. **Opt-in only** — nothing is recorded until you run `mtc analytics enable`
2. **Local-only** — data never leaves your machine automatically
3. **No content** — file contents, prompts, and responses are never captured
4. **Disposable** — deleting the mtc database removes all telemetry
