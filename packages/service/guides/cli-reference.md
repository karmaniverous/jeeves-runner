---
title: CLI Reference
---

# CLI Reference

All commands are accessed via `jeeves-runner <command>`.

---

## `start`

Start the runner daemon.

```bash
jeeves-runner start -c <path>
```

| Flag | Description |
|------|-------------|
| `-c, --config <path>` | Path to config file |

Starts the scheduler, API server, and begins executing jobs on their cron schedules.

---

## `status`

Show runner service status by querying the API.

```bash
jeeves-runner status -c <path>
```

| Flag | Description |
|------|-------------|
| `-c, --config <path>` | Path to config file (used to determine port) |

Calls `GET /stats` on the running instance and prints the result.

---

## `add-job`

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
| `-s, --schedule <cron>` | Yes | — | Cron expression (validated on input) |
| `--script <path>` | Yes | — | Absolute path to executable script |
| `-t, --type <type>` | No | `script` | Job type: `script` or `session` |
| `-d, --description <desc>` | No | — | Job description |
| `--timeout <ms>` | No | — | Timeout in milliseconds |
| `--overlap <policy>` | No | `skip` | Overlap policy: `skip` or `allow` |
| `--on-failure <channel>` | No | — | Slack channel ID for failure alerts |
| `--on-success <channel>` | No | — | Slack channel ID for success alerts |
| `-c, --config <path>` | No | — | Config file (for database path) |

---

## `list-jobs`

List all registered jobs.

```bash
jeeves-runner list-jobs -c <path>
```

Output shows enabled/disabled status, job ID, schedule, and name:

```
?? sync-email  3 * * * *  Sync Email Metadata
?? old-job     0 4 * * *  Deprecated Import
```

---

## `trigger`

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

## `validate`

Validate a config file against the Zod schema without starting the runner.

```bash
jeeves-runner validate -c <path>
```

Prints resolved config values if valid, or validation errors if invalid.

---

## `init`

Generate a starter config file with sensible defaults.

```bash
jeeves-runner init [-o <path>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <path>` | `./jeeves-runner.config.json` | Output file path |

---

## `config-show`

Show resolved config with secrets redacted.

```bash
jeeves-runner config-show -c <path>
```

Loads the config, applies defaults, redacts sensitive fields (token paths), and prints the result.

---

## `service install`

Print platform-appropriate service registration instructions.

```bash
jeeves-runner service install -c <path>
```

Detects the current platform and prints instructions for:
- **Linux** — systemd unit file
- **Windows** — NSSM service registration commands
- **macOS** — launchd plist

---

## `service uninstall`

Print platform-appropriate service removal instructions.

```bash
jeeves-runner service uninstall
```
