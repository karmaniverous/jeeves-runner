---
title: Getting Started
---

# Getting Started

This guide walks you through installing and configuring `jeeves-runner` from scratch.

## Prerequisites

- **Node.js 20+** (Node.js 24+ recommended)
- SQLite support is built-in via Node.js `node:sqlite`

## Installation

Install globally via npm:

```bash
npm install -g @karmaniverous/jeeves-runner
```

Or add to a project:

```bash
npm install --save-dev @karmaniverous/jeeves-runner
```

## Initialize Configuration

Generate a starter config file:

```bash
jeeves-runner init -o ./jeeves-runner.config.json
```

This creates a config file with sensible defaults. See the [Configuration Guide](./configuration.md) for full reference.

## Add Your First Job

```bash
jeeves-runner add-job \
  -c ./jeeves-runner.config.json \
  --id hello-world \
  --name "Hello World" \
  --schedule "*/5 * * * *" \
  --script /path/to/hello.js
```

This registers a job that runs every 5 minutes. The script must be an absolute path to an executable script.

### Job Types

| Type | Description |
|------|-------------|
| `script` | Spawns a child process to run the script (default) |
| `session` | Dispatches the script content to an OpenClaw Gateway session |

## Start the Runner

```bash
jeeves-runner start -c ./jeeves-runner.config.json
```

The runner starts:
1. SQLite database initialization and migrations
2. Job schedule registration via cron
3. HTTP API server on the configured port (default: 1937)

## Verify

Check the runner is healthy:

```bash
curl http://localhost:1937/health
```

```json
{
  "ok": true,
  "uptime": 12.345,
  "failedRegistrations": 0
}
```

List registered jobs:

```bash
curl http://localhost:1937/jobs
```

Or via the CLI:

```bash
jeeves-runner list-jobs -c ./jeeves-runner.config.json
```

## Next Steps

- [Configuration Reference](./configuration.md) — full config schema documentation
- [API Reference](./api-reference.md) — HTTP API endpoints
- [CLI Reference](./cli-reference.md) — all CLI commands
- [Architecture](./architecture.md) — how jeeves-runner works internally
- [Deployment](./deployment.md) — running as a system service
