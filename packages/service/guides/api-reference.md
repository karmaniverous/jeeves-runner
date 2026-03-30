---
title: API Reference
---

# API Reference

jeeves-runner exposes a Fastify HTTP API for job management and monitoring. Default port: **1937**, default bind address: **0.0.0.0**.

---

## Service Status

### `GET /status`

Returns service status with version and health metrics.

**Response:**

```json
{
  "name": "runner",
  "version": "0.8.0",
  "uptime": 3661.234,
  "status": "ok",
  "health": {
    "totalJobs": 28,
    "running": 2,
    "failedRegistrations": 0,
    "okLastHour": 45,
    "errorsLastHour": 1
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Service name (`"runner"`) |
| `version` | `string` | Service version (injected at build time) |
| `uptime` | `number` | Process uptime in seconds |
| `status` | `string` | Service status (`"ok"`) |
| `health.totalJobs` | `number` | Total registered jobs |
| `health.running` | `number` | Currently executing jobs |
| `health.failedRegistrations` | `number` | Jobs that failed cron registration |
| `health.okLastHour` | `number` | Successful runs in the last hour |
| `health.errorsLastHour` | `number` | Failed/timed-out runs in the last hour |

---

## Configuration

### `GET /config`

Query the resolved service configuration. Supports optional JSONPath filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string` | — | JSONPath expression to filter config |

**Example:** `GET /config?path=$.port`

### `POST /config/apply`

Apply a configuration patch to the running service.

**Request Body:**

```json
{
  "patch": { "log": { "level": "debug" } },
  "replace": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `patch` | `object` | Yes | Configuration fields to update |
| `replace` | `boolean` | No | Replace entire config instead of merging (default: false) |

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

### `POST /jobs`

Create a new job. See the CLI Reference for field descriptions.

**Response (201):**

```json
{
  "ok": true,
  "id": "my-job"
}
```

### `PATCH /jobs/:id`

Partial update of an existing job. Only supplied fields are changed.

**Response (200):**

```json
{
  "ok": true
}
```

### `DELETE /jobs/:id`

Delete a job and all its run history.

**Response (200):**

```json
{
  "ok": true
}
```

### `PATCH /jobs/:id/enable`

Enable a disabled job. Takes effect immediately (triggers reconciliation).

**Response (200):**

```json
{
  "ok": true
}
```

### `PATCH /jobs/:id/disable`

Disable a job. The job will not run until re-enabled.

**Response (200):**

```json
{
  "ok": true
}
```

### `PUT /jobs/:id/script`

Update a job's script content or path without changing other fields.

**Response (200):**

```json
{
  "ok": true
}
```
