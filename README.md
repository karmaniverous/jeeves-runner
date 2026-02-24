# jeeves-runner

[![npm version](https://img.shields.io/npm/v/@karmaniverous/jeeves-runner.svg)](https://www.npmjs.com/package/@karmaniverous/jeeves-runner)
![Node Current](https://img.shields.io/node/v/@karmaniverous/jeeves-runner)
[![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/jeeves-runner/tree/main/LICENSE.md)

Graph-aware job execution engine with SQLite state. Part of the [Jeeves platform](#the-jeeves-platform).

## What It Does

jeeves-runner schedules and executes jobs, tracks their state in SQLite, and exposes status via a REST API. It replaces both n8n and Windows Task Scheduler as the substrate for data flow automation.

**Key properties:**

- **Domain-agnostic.** The runner knows graph primitives (source, sink, datastore, queue, process, auth), not business concepts. "Email polling" and "meeting extraction" are just jobs with scripts.
- **SQLite-native.** Job definitions, run history, cursors, and queues live in a single SQLite file. No external database, no Redis.
- **Zero new infrastructure.** One Node.js process, one SQLite file. Runs as a system service via NSSM (Windows) or systemd (Linux).
- **Scripts as config.** Job scripts live outside the runner repo at configurable absolute paths. The runner is generic; the scripts are instance-specific.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  jeeves-runner                   │
│                                                  │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Scheduler │──│ Executor │──│  Notifier    │  │
│  │  (croner) │  │ (spawn)  │  │  (Slack)     │  │
│  └───────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  SQLite   │  │ REST API │  │ Maintenance  │  │
│  │   (DB)    │  │(Fastify) │  │ (pruning)    │  │
│  └───────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
         │                │
         ▼                ▼
   runner.sqlite    localhost:3100
```

### Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js v24+ (uses built-in `node:sqlite`) |
| Scheduler | [croner](https://www.npmjs.com/package/croner) |
| Database | SQLite via `node:sqlite` |
| Process isolation | `child_process.spawn` |
| HTTP API | [Fastify](https://fastify.dev/) |
| Logging | [pino](https://getpino.io/) |
| Config validation | [Zod](https://zod.dev/) |

## Installation

```bash
npm install @karmaniverous/jeeves-runner
```

Requires Node.js 24+ for `node:sqlite` support.

## Quick Start

### 1. Create a config file

```json
{
  "port": 3100,
  "dbPath": "./data/runner.sqlite",
  "maxConcurrency": 4,
  "runRetentionDays": 30,
  "cursorCleanupIntervalMs": 3600000,
  "shutdownGraceMs": 30000,
  "notifications": {
    "slackTokenPath": "./credentials/slack-bot-token",
    "defaultOnFailure": "YOUR_SLACK_CHANNEL_ID",
    "defaultOnSuccess": null
  },
  "log": {
    "level": "info",
    "file": "./data/runner.log"
  }
}
```

### 2. Start the runner

```bash
npx jeeves-runner start --config ./config.json
```

### 3. Add a job

```bash
npx jeeves-runner add-job \
  --id my-job \
  --name "My Job" \
  --schedule "*/5 * * * *" \
  --script /absolute/path/to/script.js \
  --config ./config.json
```

### 4. Check status

```bash
npx jeeves-runner status --config ./config.json
npx jeeves-runner list-jobs --config ./config.json
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `start` | Start the runner daemon |
| `status` | Show runner stats (queries the HTTP API) |
| `list-jobs` | List all configured jobs |
| `add-job` | Add a new job to the database |
| `trigger` | Manually trigger a job run (queries the HTTP API) |

All commands accept `--config <path>` to specify the config file.

## HTTP API

The runner exposes a REST API on `localhost` (not externally accessible by default).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/jobs` | List all jobs with last run status |
| `GET` | `/jobs/:id` | Single job detail |
| `GET` | `/jobs/:id/runs` | Run history (paginated via `?limit=N`) |
| `POST` | `/jobs/:id/run` | Trigger manual run |
| `POST` | `/jobs/:id/enable` | Enable a job |
| `POST` | `/jobs/:id/disable` | Disable a job |
| `GET` | `/stats` | Aggregate stats (jobs ok/error/running counts) |

### Example response

```json
// GET /jobs
{
  "jobs": [
    {
      "id": "email-poll",
      "name": "Poll Email",
      "schedule": "*/11 * * * *",
      "enabled": 1,
      "last_status": "ok",
      "last_run": "2026-02-24T10:30:00"
    }
  ]
}
```

## SQLite Schema

Four tables manage all runner state:

### `jobs` — Job Definitions

Each job has an ID, name, cron schedule, script path, and behavioral configuration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Job identifier (e.g. `email-poll`) |
| `name` | TEXT | Human-readable name |
| `schedule` | TEXT | Cron expression |
| `script` | TEXT | Absolute path to script |
| `type` | TEXT | `script` or `session` (LLM dispatcher) |
| `enabled` | INTEGER | 1 = active, 0 = paused |
| `timeout_ms` | INTEGER | Kill after this duration (null = no limit) |
| `overlap_policy` | TEXT | `skip` (default), `queue`, or `allow` |
| `on_failure` | TEXT | Slack channel ID for failure alerts |
| `on_success` | TEXT | Slack channel ID for success alerts |

### `runs` — Run History

Every execution is recorded with status, timing, output capture, and optional token tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing run ID |
| `job_id` | TEXT FK | References `jobs.id` |
| `status` | TEXT | `pending`, `running`, `ok`, `error`, `timeout`, `skipped` |
| `duration_ms` | INTEGER | Wall-clock execution time |
| `exit_code` | INTEGER | Process exit code |
| `tokens` | INTEGER | LLM token count (session jobs only) |
| `result_meta` | TEXT | JSON from `JR_RESULT:{json}` stdout lines |
| `stdout_tail` | TEXT | Last 100 lines of stdout |
| `stderr_tail` | TEXT | Last 100 lines of stderr |
| `trigger` | TEXT | `schedule`, `manual`, or `retry` |

Runs older than `runRetentionDays` are automatically pruned.

### `cursors` — Key-Value State

General-purpose key-value store with optional TTL. Replaces JSONL registry files.

| Column | Type | Description |
|--------|------|-------------|
| `namespace` | TEXT | Logical grouping (typically job ID) |
| `key` | TEXT | State key |
| `value` | TEXT | State value (string or JSON) |
| `expires_at` | TEXT | Optional TTL (ISO timestamp, auto-cleaned) |

### `queues` — Work Queues

Priority-ordered work queues with claim semantics. SQLite's serialized writes prevent double-claims.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing item ID |
| `queue` | TEXT | Queue name |
| `payload` | TEXT | JSON blob |
| `status` | TEXT | `pending`, `claimed`, `done`, `error` |
| `priority` | INTEGER | Higher = more urgent |
| `attempts` | INTEGER | Delivery attempt count |
| `max_attempts` | INTEGER | Maximum retries |

## Job Scripts

Jobs are plain Node.js scripts executed as child processes. The runner passes context via environment variables:

| Variable | Description |
|----------|-------------|
| `JR_DB_PATH` | Path to the runner SQLite database |
| `JR_JOB_ID` | ID of the current job |
| `JR_RUN_ID` | ID of the current run |

### Structured output

Scripts can emit structured results by writing a line to stdout:

```
JR_RESULT:{"tokens":1500,"meta":"processed 42 items"}
```

The runner parses this and stores the data in the `runs` table.

### Client library

Job scripts can import the runner client for cursor and queue operations:

```typescript
import { createClient } from '@karmaniverous/jeeves-runner';

const jr = createClient(); // reads JR_DB_PATH from env

// Cursors (key-value state)
const lastId = jr.getCursor('email-poll', 'last_history_id');
jr.setCursor('email-poll', 'last_history_id', newId);
jr.setCursor('email-poll', `seen:${threadId}`, '1', { ttl: '30d' });
jr.deleteCursor('email-poll', 'old_key');

// Queues
jr.enqueue('email-updates', { threadId, action: 'label' });
const items = jr.dequeue('email-updates', 10); // claim up to 10
jr.done(items[0].id);
jr.fail(items[1].id, 'API error');

jr.close();
```

## Job Lifecycle

```
Cron fires
  → Check overlap policy (skip if running & policy = 'skip')
  → INSERT run (status = 'running')
  → spawn('node', [script], { env: JR_* })
  → Capture stdout/stderr (ring buffer, last 100 lines)
  → Parse JR_RESULT lines → extract tokens + result_meta
  → On timeout: kill process, status = 'timeout', notify
  → On exit 0: status = 'ok', notify if on_success configured
  → On exit ≠ 0: status = 'error', notify if on_failure configured
```

### Overlap policies

| Policy | Behavior |
|--------|----------|
| `skip` | Don't start if already running (default) |
| `queue` | Wait for current run to finish, then start |
| `allow` | Run concurrently |

### Concurrency

A global semaphore limits concurrent jobs (default: 4, configurable via `maxConcurrency`). When the limit is hit, behavior follows the job's overlap policy.

### Notifications

Slack notifications are sent via direct HTTP POST to `chat.postMessage` (no SDK dependency):

- **Failure:** `⚠️ *Job Name* failed (12.3s): error message`
- **Success:** `✅ *Job Name* completed (3.4s)`

Notifications require a Slack bot token (file path in config). Each job can override the default notification channels.

## Maintenance

The runner automatically performs periodic maintenance:

- **Run pruning:** Deletes run records older than `runRetentionDays` (default: 30).
- **Cursor cleanup:** Deletes expired cursor entries (runs every `cursorCleanupIntervalMs`, default: 1 hour).

Both tasks run on startup and at the configured interval.

## Programmatic Usage

```typescript
import { createRunner, runnerConfigSchema } from '@karmaniverous/jeeves-runner';

const config = runnerConfigSchema.parse({
  port: 3100,
  dbPath: './data/runner.sqlite',
});

const runner = createRunner(config);
await runner.start();

// Graceful shutdown
process.on('SIGTERM', () => runner.stop());
```

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | number | `3100` | HTTP API port |
| `dbPath` | string | `./data/runner.sqlite` | SQLite database path |
| `maxConcurrency` | number | `4` | Max concurrent jobs |
| `runRetentionDays` | number | `30` | Days to keep run history |
| `cursorCleanupIntervalMs` | number | `3600000` | Cursor cleanup interval (ms) |
| `shutdownGraceMs` | number | `30000` | Grace period for running jobs on shutdown |
| `notifications.slackTokenPath` | string | — | Path to Slack bot token file |
| `notifications.defaultOnFailure` | string \| null | `null` | Default Slack channel for failures |
| `notifications.defaultOnSuccess` | string \| null | `null` | Default Slack channel for successes |
| `log.level` | string | `info` | Log level (trace/debug/info/warn/error/fatal) |
| `log.file` | string | — | Log file path (stdout if omitted) |

## The Jeeves Platform

jeeves-runner is one component of a four-part platform:

| Component | Role | Status |
|-----------|------|--------|
| **jeeves-runner** | Execute: run processes, move data through the graph | This package |
| **[jeeves-watcher](https://github.com/karmaniverous/jeeves-watcher)** | Index: observe file-backed datastores, embed in Qdrant | Shipped |
| **jeeves-server** | Present: UI, API, file serving, search, dashboards | Shipped |
| **Jeeves skill** | Converse: configure, operate, and query via chat | Planned |

## Project Status

**Phase 1** (current): Replicate existing job scheduling and status reporting. Replace n8n and the Notion Process Dashboard.

### What's built

- ✅ SQLite schema (jobs, runs, cursors, queues)
- ✅ Cron scheduler with overlap policies and concurrency limits
- ✅ Job executor with output capture, timeout enforcement, and `JR_RESULT` parsing
- ✅ Client library for cursor/queue operations from job scripts
- ✅ Slack notifications for job success/failure
- ✅ REST API (Fastify) for job management and monitoring
- ✅ CLI for daemon management and job operations
- ✅ Maintenance tasks (run pruning, cursor cleanup)
- ✅ Zod-validated configuration
- ✅ Seed script for 27 existing n8n workflows
- ✅ 75 passing tests

### What's next (Phase 1 remaining)

- [ ] NSSM service setup
- [ ] jeeves-server dashboard page (`/runner`)
- [ ] Migrate jobs from n8n one by one
- [ ] Retire n8n

### Future phases

| Feature | Phase |
|---------|-------|
| Graph topology (nodes/edges schema) | 2 |
| Credential/auth management | 2 |
| REST API for graph mutations | 2 |
| OpenClaw plugin & Jeeves skill | 3 |
| Container packaging | 3 |

## Development

```bash
npm install
npx lefthook install

npm run lint        # ESLint + Prettier
npm run test        # Vitest
npm run knip        # Unused code detection
npm run build       # Rollup (ESM + types + CLI)
npm run typecheck   # TypeScript (noEmit)
```

## License

BSD-3-Clause
