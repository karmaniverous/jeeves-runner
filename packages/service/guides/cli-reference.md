---
title: CLI Reference
---

# CLI Reference

All commands are accessed via `jeeves-runner <command>`. The CLI is built with `createServiceCli(descriptor)` from core, which provides standard commands, plus custom commands for job management.

---

## Standard Commands

### `start`

Start the runner daemon (foreground).

```bash
jeeves-runner start -c <path>
```

| Flag | Description |
|------|-------------|
| `-c, --config <path>` | Path to config file |

Starts the scheduler, API server, and begins executing jobs on their cron schedules.

---

### `status`

Probe service health and version by querying `GET /status`.

```bash
jeeves-runner status [-p <port>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --port <port>` | `1937` | Service port |

---

### `config`

Query or manage service configuration.

```bash
jeeves-runner config [jsonpath] [-p <port>]
```

Queries `GET /config` on the running instance. Pass a JSONPath expression to filter.

#### `config validate`

Validate a config file against the Zod schema without starting the runner.

```bash
jeeves-runner config validate -c <path>
```

#### `config apply`

Apply a config patch to the running service.

```bash
jeeves-runner config apply [-p <port>] [-f <path>] [--replace]
```

| Flag | Description |
|------|-------------|
| `-p, --port <port>` | Service port (default: 1937) |
| `-f, --file <path>` | Config patch file (JSON); reads stdin if omitted |
| `--replace` | Replace entire config instead of merging |

---

### `init`

Generate a default config file.

```bash
jeeves-runner init [-o <dir>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <dir>` | Platform config dir | Output directory for `config.json` |

---

### `service`

System service management subcommands.

#### `service install`

Install as a system service.

```bash
jeeves-runner service install [-c <path>] [-n <name>]
```

#### `service uninstall`

Uninstall the system service.

```bash
jeeves-runner service uninstall [-n <name>]
```

#### `service start`

Start the system service.

```bash
jeeves-runner service start [-n <name>]
```

#### `service stop`

Stop the system service.

```bash
jeeves-runner service stop [-n <name>]
```

#### `service restart`

Restart the system service.

```bash
jeeves-runner service restart [-n <name>]
```

#### `service status`

Query system service state.

```bash
jeeves-runner service status [-n <name>]
```

---

## Custom Commands

### `add-job`

Register a new job in the database.

```bash
jeeves-runner add-job \
  -c <config> \
  --id <id> \
  --name <name> \
  --schedule <cron> \
  --script <path> \
  [--type <type>] \
  [--description <desc>] \
  [--timeout <ms>] \
  [--overlap <policy>] \
  [--on-failure <channel>] \
  [--on-success <channel>]
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `-i, --id <id>` | Yes | — | Unique job identifier |
| `-n, --name <name>` | Yes | — | Human-readable name |
| `-s, --schedule <schedule>` | Yes | — | Cron expression or RRStack JSON (validated on input) |
| `--script <path>` | Yes | — | Absolute path to executable script |
| `-t, --type <type>` | No | `script` | Job type: `script` or `session` |
| `-d, --description <desc>` | No | — | Job description |
| `--timeout <ms>` | No | — | Timeout in milliseconds |
| `--overlap <policy>` | No | `skip` | Overlap policy: `skip` or `allow` |
| `--on-failure <channel>` | No | — | Slack channel ID for failure alerts |
| `--on-success <channel>` | No | — | Slack channel ID for success alerts |
| `-c, --config <path>` | No | — | Config file (for database path) |

---

### `list-jobs`

List all registered jobs.

```bash
jeeves-runner list-jobs -c <path>
```

Output shows enabled/disabled status, job ID, schedule, and name.

---

### `trigger`

Manually trigger a job via the API.

```bash
jeeves-runner trigger -i <id> -c <path>
```

| Flag | Required | Description |
|------|----------|-------------|
| `-i, --id <id>` | Yes | Job ID to trigger |
| `-c, --config <path>` | No | Config file (for port) |

Calls `POST /jobs/:id/run` and prints the result.

---

### `init-scripts`

Scaffold a new scripts project from the `jeeves-scripts-template`.

```bash
jeeves-runner init-scripts [-c <path>]
```

| Flag | Description |
|------|-------------|
| `-c, --config <path>` | Config file path (determines scripts location) |

Clones the template into a `scripts/` directory next to the config, installs dependencies, and configures the `runners.ts` entry in the config file for TypeScript execution via tsx.
