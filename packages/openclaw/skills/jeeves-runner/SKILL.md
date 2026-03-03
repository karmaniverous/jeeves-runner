---
name: jeeves-runner
description: Operate and troubleshoot the jeeves-runner job execution engine. Use when managing scheduled jobs, checking run status, triggering manual runs, debugging script failures, updating job configuration, or working with the runner's SQLite database, HTTP API, or process scripts.
---

# Jeeves Runner — Operational Guide

*Operational knowledge for any installation running jeeves-runner.*

## Architecture

jeeves-runner is a Node.js job execution engine that schedules and runs process scripts via cron expressions, tracks state in SQLite, and exposes an HTTP API. It typically runs as a system service.

| Component | Detail |
|-----------|--------|
| Package | `@karmaniverous/jeeves-runner` (globally installed) |
| Default Port | `1937` |
| Database | `runner.sqlite` (node:sqlite DatabaseSync) |
| Config | JSON config file with `dbPath`, `port`, `scheduleFile`, `notifications` |

## Plugin Installation

```
npx @karmaniverous/jeeves-runner-openclaw install
```

This copies the plugin to OpenClaw's extensions directory and patches `openclaw.json` to register it. Restart the gateway to load the plugin.

To remove:
```
npx @karmaniverous/jeeves-runner-openclaw uninstall
```

## Quick Start (Existing Deployment)

If the runner service is already running and healthy:

1. Call `runner_status` to verify the service is up and check job counts
2. Call `runner_jobs` to see all registered jobs and their last run status
3. Use `runner_trigger` to manually fire a job, `runner_runs` for history

## Bootstrap (First-Time Setup)

When the plugin loads and the runner service is NOT yet set up, drive the entire setup proactively. The user should be able to install the plugin with nothing else in place and the bootstrap process gets them to a working system.

**The agent drives this process.** Don't hand the user CLI commands and wait. Check each prerequisite, explain what's needed, execute what you can, and prompt the user only for decisions that require human judgment.

### Step 1: Check Node.js

Verify Node.js is installed and version ≥ 20 (required for `node:sqlite`):
```bash
node --version
```

If missing or too old, guide the user to install Node.js 20+ from https://nodejs.org or via their package manager. Node.js 20 is the minimum because jeeves-runner uses `node:sqlite` (DatabaseSync), which is only available in Node.js 22+ as stable, but available behind flags in 20+.

**Recommendation:** Node.js 22+ for best `node:sqlite` support.

### Step 2: Install jeeves-runner

Install the runner package globally:
```bash
npm install -g @karmaniverous/jeeves-runner
```

Verify:
```bash
jeeves-runner --version
```

### Step 3: Plan the Deployment

Ask the user these questions to build the config:

1. **Where should the database live?** (default: `./data/runner.sqlite` relative to working directory)
   - Suggest a stable, backed-up location (e.g., `/var/lib/jeeves-runner/runner.sqlite` on Linux, `C:\ProgramData\jeeves-runner\runner.sqlite` on Windows)
2. **What port for the API?** (default: 1937)
3. **Do you want Slack notifications for job failures?**
   - If yes: need a Slack bot token file path and a default channel ID
4. **Is OpenClaw running on this machine?**
   - If yes: the runner can dispatch LLM sessions via the OpenClaw gateway (default: `http://127.0.0.1:18789`)
   - Need the gateway token file path
5. **Where will process scripts live?** (recommend a dedicated directory, e.g., `~/scripts` or `C:\scripts`)

### Step 4: Create Config File

Generate the config file based on user answers. Example minimal config:

```json
{
  "port": 1937,
  "dbPath": "/var/lib/jeeves-runner/runner.sqlite",
  "maxConcurrency": 4,
  "runRetentionDays": 30,
  "log": {
    "level": "info",
    "file": "/var/log/jeeves-runner/runner.log"
  }
}
```

Full config with notifications and gateway:

```json
{
  "port": 1937,
  "dbPath": "/var/lib/jeeves-runner/runner.sqlite",
  "maxConcurrency": 4,
  "runRetentionDays": 30,
  "log": {
    "level": "info",
    "file": "/var/log/jeeves-runner/runner.log"
  },
  "notifications": {
    "slackTokenPath": "/path/to/slack-bot-token.txt",
    "defaultOnFailure": "C0123456789"
  },
  "gateway": {
    "url": "http://127.0.0.1:18789",
    "tokenPath": "/path/to/gateway-token.txt"
  }
}
```

Write the config to a sensible location:
- **Linux:** `~/.config/jeeves-runner.config.json` or `/etc/jeeves-runner/config.json`
- **Windows:** alongside the data directory or in a config directory
- **macOS:** `~/.config/jeeves-runner.config.json`

Create the database directory and log directory:
```bash
# Linux
sudo mkdir -p /var/lib/jeeves-runner /var/log/jeeves-runner
sudo chown $USER:$USER /var/lib/jeeves-runner /var/log/jeeves-runner

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path C:\ProgramData\jeeves-runner
```

### Step 5: Test Start (Foreground)

Start the runner in the foreground first to verify everything works:
```bash
jeeves-runner start -c /path/to/config.json
```

In another terminal, verify:
```bash
curl http://127.0.0.1:1937/health
# Expected: { "ok": true, "uptime": <seconds>, "failedRegistrations": 0 }
```

Stop it with Ctrl+C after confirming it starts cleanly.

### Step 6: Register as a Service

**The runner should run as a persistent service, not a foreground process.**

**Linux (systemd):**
```bash
sudo tee /etc/systemd/system/jeeves-runner.service > /dev/null <<EOF
[Unit]
Description=Jeeves Runner - Job Execution Engine
After=network.target

[Service]
Type=simple
ExecStart=$(which jeeves-runner) start -c /path/to/config.json
WorkingDirectory=/var/lib/jeeves-runner
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now jeeves-runner
```

**Windows (NSSM):**
```powershell
# Install NSSM if not present: https://nssm.cc/download
nssm install jeeves-runner "C:\Program Files\nodejs\node.exe" "C:\Users\<user>\AppData\Roaming\npm\node_modules\@karmaniverous\jeeves-runner\dist\cli\jeeves-runner\index.js" start -c "C:\path\to\config.json"
nssm set jeeves-runner AppDirectory "C:\ProgramData\jeeves-runner"
nssm set jeeves-runner DisplayName "Jeeves Runner"
nssm set jeeves-runner Description "Job execution engine with SQLite state"

# Set NODE_PATH so global modules resolve
nssm set jeeves-runner AppEnvironmentExtra "NODE_PATH=C:\Users\<user>\AppData\Roaming\npm\node_modules"

nssm start jeeves-runner
```

**macOS (launchd):**
```bash
cat > ~/Library/LaunchAgents/com.jeeves.runner.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jeeves.runner</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which jeeves-runner)</string>
    <string>start</string>
    <string>-c</string>
    <string>/path/to/config.json</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.jeeves.runner.plist
```

Verify the service started:
```bash
curl http://127.0.0.1:1937/health
```

Or use `runner_status` if the plugin tools are available.

### Step 7: Add Initial Jobs

Guide the user through adding their first job. Use the CLI:

```bash
jeeves-runner add-job \
  -i my-first-job \
  -n "My First Job" \
  -s "*/5 * * * *" \
  --script /path/to/script.js \
  -c /path/to/config.json
```

Or insert directly via SQLite (useful for bulk setup):
```sql
INSERT INTO jobs (id, name, schedule, script, type, enabled, overlap_policy)
VALUES ('my-first-job', 'My First Job', '*/5 * * * *', '/path/to/script.js', 'script', 1, 'skip');
```

**Job parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | — | Unique job identifier (kebab-case recommended) |
| `name` | Yes | — | Human-readable name |
| `schedule` | Yes | — | Cron expression (5 or 6 fields; 6th = seconds) |
| `script` | Yes | — | Absolute path to the process script |
| `type` | No | `script` | `script` or `session` |
| `timeout_ms` | No | — | Kill the job after this many ms |
| `overlap_policy` | No | `skip` | `skip` (don't start if already running) or `allow` |
| `on_failure` | No | config default | Slack channel ID for failure alerts |
| `on_success` | No | config default | Slack channel ID for success alerts |

**A starter process script:**
```javascript
// /path/to/script.js
// Simple example: log the current time and exit
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  message: 'Hello from jeeves-runner!'
}));
```

After adding the job, trigger it manually to verify:
```bash
jeeves-runner trigger -i my-first-job -c /path/to/config.json
```

Or use `runner_trigger` with `jobId: "my-first-job"`.

### Step 8: Integrate with jeeves-watcher (Optional)

If jeeves-watcher is also deployed, the runner's process scripts and their outputs can be indexed for semantic search.

**Add runner data directories to the watcher config's watch paths:**
- Script output directories (wherever your scripts write domain data)
- Log files (if you want runner logs searchable)

**Create watcher inference rules** for runner-produced data (e.g., domain-specific JSON files, markdown reports).

**The runner and watcher are complementary:** the runner executes data pipeline jobs; the watcher indexes the outputs for retrieval. Together they form a collect → process → index pipeline.

### On Subsequent Sessions

On sessions after bootstrap is complete:

1. Call `runner_status` silently to check health
2. If the service is down, report it immediately
3. If there are failed registrations or recent errors, proactively surface them

**Key principle:** The agent drives discovery. After initial setup, monitor health and surface problems before the user has to ask.

---

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (`{ ok, uptime, failedRegistrations }`) |
| `GET` | `/jobs` | List all jobs with last run status |
| `GET` | `/jobs/:id` | Single job detail |
| `GET` | `/jobs/:id/runs` | Run history (`?limit=N`, default 50) |
| `POST` | `/jobs/:id/run` | Trigger manual run (synchronous — blocks until complete) |
| `POST` | `/jobs/:id/enable` | Enable a job |
| `POST` | `/jobs/:id/disable` | Disable a job |
| `GET` | `/stats` | Aggregate stats (total, running, ok/errors last hour) |

### Common Operations

```javascript
// Trigger a job manually
await fetch('http://localhost:1937/jobs/poll-email/run', { method: 'POST' });

// Check job status
const { jobs } = await (await fetch('http://localhost:1937/jobs')).json();

// Get recent runs for a job
const { runs } = await (await fetch('http://localhost:1937/jobs/poll-email/runs?limit=5')).json();

// Disable a job
await fetch('http://localhost:1937/jobs/poll-email/disable', { method: 'POST' });
```

**If the runner is unreachable:** Check the service status (`nssm status jeeves-runner` on Windows, `systemctl status jeeves-runner` on Linux), check the configured port, and check logs for startup errors.

## Tools

### `runner_status`
Service health check. Returns total jobs, running count, failed registrations, ok/error counts for last hour.

### `runner_jobs`
List all jobs with enabled state, schedule, last run status, and last run time.

### `runner_trigger`
Manually trigger a job by ID. Blocks until the job completes and returns the run result (status, duration, exit code).
- `jobId` (string, required) — The job ID to trigger

### `runner_runs`
Get recent run history for a job.
- `jobId` (string, required) — The job ID
- `limit` (number, optional) — Max results, default 50

### `runner_job_detail`
Get full configuration for a single job, including script path, schedule, timeout, overlap policy, and notification channels.
- `jobId` (string, required) — The job ID

### `runner_enable`
Enable a disabled job. Takes effect immediately (triggers scheduler reconciliation).
- `jobId` (string, required) — The job ID

### `runner_disable`
Disable a job. It will not run until re-enabled. Takes effect immediately.
- `jobId` (string, required) — The job ID

## SQLite Direct Access

For queries beyond the API surface:

```javascript
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/path/to/runner.sqlite');

// List all jobs with enabled state
db.prepare('SELECT id, name, enabled, script FROM jobs ORDER BY name').all();

// Find recent failures
db.prepare(`SELECT job_id, error, started_at FROM runs 
  WHERE status = 'error' ORDER BY started_at DESC LIMIT 10`).all();

// Update a job's script path
db.prepare('UPDATE jobs SET script = ? WHERE id = ?').run('/path/to/new-script.js', 'job-id');
```

**Important:** The scheduler re-reads job rows from the DB on each cron fire. DB changes to script paths, enabled state, timeout, etc. take effect without restarting the service.

## Tables

- **jobs** — Job definitions (id, name, schedule, script, type, enabled, timeout_ms, overlap_policy, on_failure, on_success)
- **runs** — Run history (job_id, status, started_at, duration_ms, exit_code, tokens, error, stdout_tail, stderr_tail, trigger)
- **state** — Key-value state store with namespaces and optional expiry
- **state_items** — Collection state (namespace, key, item_key, value)
- **queues** — Queue definitions (name, dedup_expr, dedup_scope, max_attempts, retention_days)
- **queue_items** — Queue items with claim semantics (queue_name, payload, status, attempts, claimed_at, done_at, error)

## Job Types

- **script** — Spawns `node <script>` (or `powershell -File` for .ps1, `cmd /c` for .cmd). Captures stdout/stderr.
- **session** — Same spawn mechanism, but the script internally calls a worker to create an LLM session for synthesis/reasoning tasks.

## Troubleshooting

### Job failing with module not found
Check the `script` column in the `jobs` table. If pointing to a stale path, update it directly in SQLite. Changes take effect on next scheduled fire.

### All jobs failing after service restart
The runner seeds from the schedule file on startup (upsert). If the schedule file has stale paths, they'll overwrite DB values. Fix the schedule file first, then restart.

### Notifications not sending
Check the runner config's `notifications.slackTokenPath`. Verify the token file exists and is valid.

### Service won't start (NSSM on Windows)
Common causes:
- `AppDirectory` points to a deleted path — update via `nssm set jeeves-runner AppDirectory <valid-path>`
- `NODE_PATH` not set — global modules won't resolve. Set via `AppEnvironmentExtra`
- Config file path wrong — verify the `-c` argument in the NSSM Application arguments

### High error rate
Use `runner_runs` on failing jobs to see error messages. Common patterns:
- Script path changed → update `script` in the jobs table
- External API rate limited → add backoff/retry in the script
- File permissions → check the service user has access to script paths and output directories

## Service Management

```bash
# Linux (systemd)
sudo systemctl status jeeves-runner
sudo systemctl restart jeeves-runner
journalctl -u jeeves-runner -f    # Follow logs

# Windows (NSSM)
nssm status jeeves-runner
nssm restart jeeves-runner
Get-Content <log-path> -Tail 20   # Recent logs
```

## Job Design Principles

**Scripts over LLM for mechanical work.** Don't call an LLM to replace a 20-line Node script. Use scripts for data fetching, parsing, transformation. Reserve LLM sessions for synthesis, reasoning, and natural language generation.

**Session dispatcher pattern:** When a job needs LLM reasoning, the process script does mechanical prep (gather data, build context), then calls a worker to create a focused LLM session. The LLM does only the reasoning step, not the data wrangling.

**Idempotency.** Process scripts should be safe to re-run. Use state keys, content hashes, or database state to avoid duplicating work.

## Engineering Standards for Process Scripts

- **Node.js preferred** (cross-platform). PowerShell only for Windows-specific system management.
- **Fail loudly.** Scripts should exit non-zero on failure with a clear error message. Don't swallow errors.
- **Structured output.** When a script produces summary output, write JSON for machine consumption. Human-readable summaries go to stdout.
- **No hardcoded secrets.** Read credentials from config files or environment variables, never inline.

## Error Handling

If the runner is unreachable:
- Inform the user that job management is temporarily unavailable
- Fall back to SQLite direct access if the database path is known
- Do not retry silently in a loop

If tools are unavailable (plugin not loaded in this session):
- The runner API is still accessible via direct HTTP calls
- Use `exec` to call the endpoints listed in the HTTP API section
- Default: `http://127.0.0.1:1937`

**CLI Fallbacks:**
- `jeeves-runner status -c <config>` — check if the service is running
- `jeeves-runner list-jobs -c <config>` — list registered jobs
- `jeeves-runner trigger -i <job-id> -c <config>` — trigger a job manually
- Restart via NSSM (Windows) or systemctl (Linux)
