---
title: Configuration
---

# Configuration

jeeves-runner uses a JSON configuration file validated against a Zod schema at startup. All fields have sensible defaults.

## JSON Schema

Config files support a `$schema` pointer for IDE autocompletion:

```json
{
  "$schema": "https://docs.karmanivero.us/jeeves-runner/schemas/config.json"
}
```

## Config File Location

The config file is located at `jeeves-runner/config.json` inside the platform config directory. Use `jeeves-runner init` to generate a starter config at the default location.

Legacy config files named `jeeves-runner.config.json` are automatically migrated to the new path on startup.

## Complete Example

```json
{
  "port": 1937,
  "host": "0.0.0.0",
  "dbPath": "./data/runner.sqlite",
  "maxConcurrency": 4,
  "runRetentionDays": 30,
  "stateCleanupIntervalMs": 3600000,
  "shutdownGraceMs": 30000,
  "reconcileIntervalMs": 60000,
  "runners": {
    "ts": "node ./scripts/node_modules/tsx/dist/cli.mjs"
  },
  "notifications": {
    "slackTokenPath": "/path/to/slack-bot-token",
    "defaultOnFailure": "C0123456789",
    "defaultOnSuccess": null
  },
  "log": {
    "level": "info",
    "file": "/var/log/jeeves-runner.log"
  },
  "gateway": {
    "url": "http://127.0.0.1:18789",
    "tokenPath": "/path/to/gateway-token"
  }
}
```

## Reference

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `1937` | HTTP server port for the runner API |
| `host` | `string` | `"0.0.0.0"` | Bind address for the HTTP server |
| `dbPath` | `string` | `"./data/runner.sqlite"` | Path to the SQLite database file |
| `maxConcurrency` | `number` | `4` | Maximum number of concurrent job executions |
| `runRetentionDays` | `number` | `30` | Number of days to retain completed run records |
| `stateCleanupIntervalMs` | `number` | `3600000` | Interval (ms) for expired state cleanup |
| `shutdownGraceMs` | `number` | `30000` | Grace period (ms) for in-flight jobs during shutdown |
| `reconcileIntervalMs` | `number` | `60000` | Interval (ms) for job reconciliation checks |
| `runners` | `Record<string, string>` | `{}` | Custom command runners keyed by file extension (e.g., `{ "ts": "node path/to/tsx/cli.mjs" }`) |

### `notifications`

Slack notification configuration for job completion events.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `slackTokenPath` | `string?` | � | Path to file containing Slack bot token |
| `defaultOnFailure` | `string \| null` | `null` | Default Slack channel ID for failure notifications |
| `defaultOnSuccess` | `string \| null` | `null` | Default Slack channel ID for success notifications |

Per-job overrides: each job can specify its own `on_failure` and `on_success` channels that override the defaults.

### `log`

Logging configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | `string` | `"info"` | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `file` | `string?` | � | Optional log file path (logs to stdout if omitted) |

### `gateway`

OpenClaw Gateway configuration for session-type jobs.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | `"http://127.0.0.1:18789"` | Gateway HTTP API URL |
| `tokenPath` | `string?` | � | Path to file containing Gateway auth token |

Session-type jobs dispatch work to the OpenClaw Gateway via its `/tools/invoke` endpoint. The gateway must have `sessions_spawn` in `gateway.tools.allow` for session jobs to work.

## Validation

Validate a config file without starting the runner:

```bash
jeeves-runner config validate -c ./jeeves-runner/config.json
```

Query resolved config from the running service:

```bash
jeeves-runner config
jeeves-runner config '$.port'
```

Apply a config patch to the running service:

```bash
jeeves-runner config apply -f patch.json
```

## Environment Variables

The config file supports no environment variable substitution natively. Use wrapper scripts or template tools if needed.
