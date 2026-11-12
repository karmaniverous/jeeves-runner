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

| Flag                  | Description         |
| --------------------- | ------------------- |
| `-c, --config <path>` | Path to config file |

Starts the scheduler, API server, and begins executing jobs on their cron schedules.

---

### `status`

Probe service health and version by querying `GET /status`.

```bash
jeeves-runner status [-p <port>]
```

| Flag                | Default | Description  |
| ------------------- | ------- | ------------ |
| `-p, --port <port>` | `1937`  | Service port |

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

| Flag                | Description                                      |
| ------------------- | ------------------------------------------------ |
| `-p, --port <port>` | Service port (default: 1937)                     |
| `-f, --file <path>` | Config patch file (JSON); reads stdin if omitted |
| `--replace`         | Replace entire config instead of merging         |

---

### `init`

Generate a default config file.

```bash
jeeves-runner init [-o <dir>]
```

| Flag | Default | Description |
| --- | --- | --- |
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

### Finding the config and database

`add-job`, `list-jobs` and `sync-jobs` open the runner database, so they need the runner config (DD#81):

- `-c, --config <path>` given: that file (a missing file is an error).
- Otherwise `{configRoot}/jeeves-runner/config.json`, the file `jeeves-runner init` writes. `configRoot` comes from `--config-root`, then `JEEVES_CONFIG_ROOT`, then `core.configRoot` in `jeeves.config.json` in the workspace (`-w, --workspace`, then `JEEVES_WORKSPACE`, then `.`), then `./config`.
- No file there: the command exits 1 without touching any database, naming the path it tried, where `configRoot` came from, and the fixes (`-c`, `--config-root`/`JEEVES_CONFIG_ROOT`, or `jeeves-runner init`). Commands never fall back to schema defaults.

Before doing anything else they print the absolute paths to **stderr** (stdout stays the command's output):

```text
Config: J:\config\jeeves-runner\config.json
Database: J:\state\runner\runner.sqlite
```

A relative `dbPath` is resolved against the current directory, as the service does, so check the `Database:` line or use an absolute `dbPath`.

All four custom commands take `-w, --workspace <path>` and `--config-root <path>`. `trigger` uses them only to find the service URL and never needs a runner config file.

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
| --- | --- | --- | --- |
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
| `-c, --config <path>` | No | `{configRoot}/jeeves-runner/config.json` | Runner config (for the database path); see [Finding the config and database](#finding-the-config-and-database) |
| `-w, --workspace <path>` | No | env, then `.` | Workspace root (for `jeeves.config.json`) |
| `--config-root <path>` | No | env, `jeeves.config.json`, then `./config` | Platform config root |

---

### `list-jobs`

List all registered jobs.

```bash
jeeves-runner list-jobs [-c <path>] [-w <path>] [--config-root <path>]
```

Output shows enabled/disabled status, job ID, schedule, and name. The config is found as described in [Finding the config and database](#finding-the-config-and-database).

---

### `trigger`

Manually trigger a job via the API.

```bash
jeeves-runner trigger -i <id> [-w <path>] [--config-root <path>]
```

| Flag | Required | Description |
| --- | --- | --- |
| `-i, --id <id>` | Yes | Job ID to trigger |
| `-w, --workspace <path>` | No | Workspace root (default: `JEEVES_WORKSPACE`, then `.`) |
| `--config-root <path>` | No | Platform config root (default: `JEEVES_CONFIG_ROOT`, `jeeves.config.json`, then `./config`) |

Resolves the service URL with `getServiceUrl('runner')` from the config root, calls `POST /jobs/:id/run` through `@karmaniverous/jeeves-runner-sdk` (the job id URL-encoded) and prints the result. It needs no runner config file. The call waits up to 30 minutes for the job to finish; a longer job keeps running on the runner.

| Outcome | Output | Exit |
| --- | --- | --- |
| Job ran | the response body (`{ result: { status, exitCode, durationMs, ... } }`) on stdout | 0 |
| Non-2xx (404 `RUNNER_JOB_NOT_FOUND`, 409 `RUNNER_MAX_CONCURRENCY`, 500 `RUNNER_TRIGGER_FAILED`) | `Trigger failed (HTTP <status>): <the error body's message>` (e.g. `Trigger failed (HTTP 409): Max concurrency reached; retry when a running job finishes.`) | 1 |
| Runner not running or URL unusable | `Runner not reachable at <url>. Is it running?` | 1 |
| Timeout, or a 2xx that is not a run result | `Trigger failed: <reason>` | 1 |

---

### `sync-jobs`

Sync job definitions into the database.

```bash
jeeves-runner sync-jobs [-c <path>] [--scripts-dir <dir> | --jobs-dir <dir>] [--dry-run] [--reset-enabled] [--prune] [-w <path>] [--config-root <path>]
```

Pass `-c` (or make sure `{configRoot}/jeeves-runner/config.json` is the instance's config): see [Finding the config and database](#finding-the-config-and-database).

| Flag | Description |
| --- | --- |
| `-c, --config <path>` | Runner config (default: `{configRoot}/jeeves-runner/config.json`) |
| `-w, --workspace <path>` | Workspace root (for `jeeves.config.json`) |
| `--config-root <path>` | Platform config root |
| `--scripts-dir <dir>` | jeeves-scripts repo dir (overrides config `scriptsDir`) |
| `--jobs-dir <dir>` | Legacy JSON jobs dir (deprecated; overrides config `jobsDir`) |
| `--dry-run` | Report what would change; open the database read-only |
| `--reset-enabled` | Overwrite `enabled` on existing jobs with the source value |
| `--prune` | Disable launcher jobs no longer listed (scripts source only; never deletes) |

**Source.** Flags first (not both), then config `scriptsDir`, then legacy `jobsDir`. With the jeeves-scripts source the runner runs `node <scriptsDir>/bin/jeeves-scripts.js list --json` with its own Node and environment (timeout 120 s; the launcher cold-starts in about 7 s) and registers each runnable that has a manifest: `script` is the launcher, `args` are `["run", <id>, ...manifest.args]`. A manifest without `timeout_seconds` (or with `null`) stores no timeout: a script job then runs unbounded, matching jeeves-scripts, while a `session` job falls back to the session executor's 5-minute default. An operator-set timeout on an existing job is kept. A failing, unparseable, invalid or duplicate-id list aborts the sync with nothing written. The legacy source prints a deprecation warning.

**What a sync changes.**

- New jobs are added with the source's `enabled` (default `true`). A manifest `prerequisite` is printed and never blocks the add.
- On existing jobs, only fields the source specifies are updated; omitted fields stay unchanged.
- `enabled` on existing jobs is never changed unless `--reset-enabled` is given; disagreements are listed under **Enabled drift**.
- The manifest schedule is applied on every sync, and each schedule it reverts is listed. **Schedule changes made through the API or `runner_update_job` on launcher jobs don't last**; change them in `jeeves-scripts.json`.
- Launcher jobs no longer listed are reported as **Orphans**, and disabled only with `--prune`. Jobs from other sources are never touched. Paths are compared after normalisation (absolute, separators, case-insensitive on Windows).

**Dry run.** `--dry-run` opens the database read-only (DD#82): it never creates the file or its directory, never migrates, and leaves the database and its `-wal`/`-shm` files as they were. A missing database exits 1 (`Cannot open the database read-only at <path>`); a database with pending migrations exits 1, reporting its schema version and the pending ones (run without `--dry-run`, or start the runner, to migrate).

**Exit codes.** 0 when clean; 1 when any entry is skipped for an error, the sync is aborted, no config is found, or a dry run finds the database missing or unmigrated.
