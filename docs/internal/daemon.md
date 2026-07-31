# Daemon Mode & Autonomous Background Workers

**mtc** can run as a headless daemon that listens for webhooks from GitHub
or GitLab and autonomously fixes bugs triggered by issue labels.

---

## Overview

```
GitHub/GitLab Webhook
        │
        ▼
┌─────────────────┐
│  mtc daemon      │  HTTP server (port 8080)
│  /webhook        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pipeline        │  Clone repo → Analyze → Fix → Test → PR
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Notifier        │  Slack / Teams notification
└─────────────────┘
```

## Quick Start

```bash
# Start the daemon
mtc daemon \
  --port 8080 \
  --github-token ghp_... \
  --slack-webhook https://hooks.slack.com/services/... \
  --autofix-label autofix
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <port>` | HTTP server port | `8080` |
| `-H, --host <host>` | Bind address | `0.0.0.0` |
| `-s, --webhook-secret <secret>` | Secret for verifying webhook signatures | - |
| `-t, --github-token <token>` | GitHub personal access token (with `repo` scope) | - |
| `-g, --gitlab-token <token>` | GitLab personal access token | - |
| `--slack-webhook <url>` | Slack incoming webhook URL | - |
| `--teams-webhook <url>` | Teams webhook URL | - |
| `-l, --autofix-label <label>` | Issue label that triggers autonomous fixing | `autofix` |

## GitHub Webhook Setup

1. Go to your repo: **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://your-server:8080/webhook`
3. **Content type:** `application/json`
4. **Secret:** Same value as `--webhook-secret`
5. **Events:** Select "Issues" and "Push"
6. **Active:** Checked

## GitLab Webhook Setup

1. Go to your repo: **Settings → Webhooks → Add webhook**
2. **URL:** `https://your-server:8080/webhook`
3. **Secret token:** Same value as `--webhook-secret`
4. **Trigger:** Select "Issues events" and "Push events"
5. **Enable SSL verification:** As appropriate

## Autonomous Fix Pipeline

When an issue is labeled with the `autofix` label (configurable), the daemon:

1. **Validates** the webhook event and checks the label
2. **Clones** the repository (shallow clone for speed)
3. **Analyzes** the issue using the LLM:
   - Reads relevant source files based on issue keywords
   - Identifies the root cause
   - Generates a fix
4. **Applies** the fix to the local clone
5. **Tests** the fix using the project's test framework (bun test, npm test, pytest)
6. **Retries** if tests fail (one retry attempt)
7. **Creates** a branch and commits the fix
8. **Pushes** to the remote
9. **Opens** a Draft Pull Request with the fix
10. **Comments** on the original issue with a link to the PR
11. **Notifies** Slack/Teams with the result

## Notification Channels

### Slack

Messages include:
- Status emoji (green check / red X / spinner)
- Repository and issue links
- Draft PR link on success
- Timestamp

### Microsoft Teams

Messages use Adaptive Cards with:
- Status indicator and description
- Fact Set with repository, issue, PR details
- "View Pull Request" action button

## Running as a Service

### systemd (Linux)

Create `/etc/systemd/system/mtc-daemon.service`:

```ini
[Unit]
Description=MTC Autonomous Bug Fixing Daemon
After=network.target

[Service]
Type=simple
User=mtc
Environment=GITHUB_TOKEN=ghp_...
Environment=SLACK_WEBHOOK=https://...
ExecStart=/usr/local/bin/mtc daemon --port 8080
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable mtc-daemon
sudo systemctl start mtc-daemon
```

### Docker

```dockerfile
FROM oven/bun:latest
COPY . /app
WORKDIR /app
RUN bun install
EXPOSE 8080
CMD ["bun", "run", "src/cli.tsx", "daemon", "--port", "8080"]
```

## Security

- Webhook signatures are verified using HMAC-SHA256 when `--webhook-secret` is set
- GitHub tokens require minimal scopes: `repo` for private repos, `public_repo` for public
- All file operations run in isolated temp directories
- LLM calls use the same routing/fallback configuration as interactive mode
- Temp directories are cleaned up on daemon restart
