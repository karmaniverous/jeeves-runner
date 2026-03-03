---
title: API Reference
---

# API Reference

jeeves-runner exposes a Fastify HTTP API for job management and monitoring. Default port: **1937**.

---

## Health Check

### `GET /health`

Returns service health status.

**Response:**

```json
{
  "ok": true,
  "uptime": 3661.234,
  "failedRegistrations": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `boolean` | Always `true` if the server is responding |
| `uptime` | `number` | Process uptime in seconds |
| `failedRegistrations` | `number` | Jobs that failed to register with the cron scheduler |

---

## Jobs

### `GET /jobs`

List all jobs with last run status.

**Response:**

```json
{
  "jobs": [
    {
      "id": "sync-email",
      "name": "Sync Email Metadata",
      "schedule": "3 * * * *",
      "script": "/opt/scripts/sync-email.js",
      "type": "script",
      "enabled": 1,
      "timeout_ms": 120000,
      "overlap_policy": "skip",
      "on_failure": "C0123456789",
      "on_success": null,
      "last_status": "ok",
      "last_run": "2026-03-02T01:03:00.000Z"
    }
  ]
}
```

### `GET /jobs/:id`

Get full details for a single job.

**Response (200):**

```json
{
  "job": {
    "id": "sync-email",
    "name": "Sync Email Metadata",
    "schedule": "3 * * * *",
    "script": "/opt/scripts/sync-email.js",
    "type": "script",
    "enabled": 1,
    "timeout_ms": 120000,
    "overlap_policy": "skip",
    "on_failure": "C0123456789",
    "on_success": null
  }
}
```

**Response (404):**

```json
{
  "error": "Job not found"
}
```

### `GET /jobs/:id/runs`

Get run history for a job.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` | `50` | Maximum number of runs to return |

**Example:** `GET /jobs/sync-email/runs?limit=10`

**Response:**

```json
{
  "runs": [
    {
      "id": 42,
      "job_id": "sync-email",
      "started_at": "2026-03-02T01:03:00.000Z",
      "finished_at": "2026-03-02T01:03:12.345Z",
      "status": "ok",
      "exit_code": 0,
      "stdout": "Synced 15 messages",
      "stderr": "",
      "duration_ms": 12345
    }
  ]
}
```

### `POST /jobs/:id/run`

Manually trigger a job run. Blocks until the job completes.

**Response (200):**

```json
{
  "result": {
    "status": "ok",
    "exit_code": 0,
    "duration_ms": 5432,
    "stdout": "Done",
    "stderr": ""
  }
}
```

**Response (404):**

```json
{
  "error": "Job 'nonexistent' not found"
}
```

### `POST /jobs/:id/enable`

Enable a disabled job. Takes effect immediately (triggers reconciliation).

**Response (200):**

```json
{
  "ok": true
}
```

### `POST /jobs/:id/disable`

Disable a job. The job will not run until re-enabled.

**Response (200):**

```json
{
  "ok": true
}
```

---

## Statistics

### `GET /stats`

Aggregate job statistics.

**Response:**

```json
{
  "totalJobs": 28,
  "running": 2,
  "failedRegistrations": 0,
  "okLastHour": 45,
  "errorsLastHour": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `totalJobs` | `number` | Total registered jobs |
| `running` | `number` | Currently executing jobs |
| `failedRegistrations` | `number` | Jobs that failed cron registration |
| `okLastHour` | `number` | Successful runs in the last hour |
| `errorsLastHour` | `number` | Failed/timed-out runs in the last hour |
