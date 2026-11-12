---
title: API Reference
---

# API Reference

jeeves-runner exposes a Fastify HTTP API for job management and monitoring. Default port: **1937**, default bind address: **0.0.0.0**.

Every route is an entry of the runner's endpoint catalog, `RUNNER_CATALOG` in `@karmaniverous/jeeves-runner-core`, registered with jeeves `registerCatalogRoutes`:

- **Requests are validated** against the entry's params, query and body schemas. A request that fails gets `400` with code `FST_ERR_VALIDATION` and a message naming the field (`body/name Invalid input: expected string, received number`); the handler never runs. Unknown body and query fields are ignored.
- **Responses are validated** against the entry's response schema; a body that does not match is logged and answered `500` with code `JEEVES_RESPONSE_VALIDATION`.
- **Every error has one body shape**, described in [Errors](#errors) below.
- **`GET /openapi.json`** serves the OpenAPI 3.1 document generated from the catalog (no auth). The same document ships as `@karmaniverous/jeeves-runner-core/openapi.json`.
- From TypeScript, call the API with `@karmaniverous/jeeves-runner-sdk` (`createRunnerClient({ baseUrl })`): one typed method per entry, named as in the entry headings below.

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
| --- | --- | --- |
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

| Parameter | Type     | Default | Description                          |
| --------- | -------- | ------- | ------------------------------------ |
| `path`    | `string` | —       | JSONPath expression to filter config |

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
| --- | --- | --- | --- |
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
      "source_type": "path",
      "description": "Sync email metadata from Gmail",
      "on_failure": "C0123456789",
      "on_success": null,
      "output_channel": null,
      "env": null,
      "args": null,
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
    "source_type": "path",
    "description": "Sync email metadata from Gmail",
    "on_failure": "C0123456789",
    "on_success": null,
    "output_channel": null,
    "env": null,
    "args": null
  }
}
```

**Response (404):**

```json
{
  "statusCode": 404,
  "code": "RUNNER_JOB_NOT_FOUND",
  "error": "Not Found",
  "message": "Job not found: sync-email"
}
```

### `GET /jobs/:id/runs`

Get run history for a job.

**Query Parameters:**

| Parameter | Type             | Default | Description                      |
| --------- | ---------------- | ------- | -------------------------------- |
| `limit`   | positive integer | `50`    | Maximum number of runs to return |

**Example:** `GET /jobs/sync-email/runs?limit=10`

**Response:**

```json
{
  "runs": [
    {
      "id": 42,
      "job_id": "sync-email",
      "status": "ok",
      "started_at": "2026-03-02T01:03:00.000Z",
      "finished_at": "2026-03-02T01:03:12.345Z",
      "duration_ms": 12345,
      "exit_code": 0,
      "tokens": null,
      "result_meta": null,
      "error": null,
      "stdout_tail": "Synced 15 messages",
      "stderr_tail": "",
      "trigger": "schedule"
    }
  ]
}
```

### `POST /jobs/:id/run`

Manually trigger a job run. Blocks until the job completes (the SDK's `triggerJob`, the plugin's `runner_trigger` and the CLI `trigger` wait up to 30 minutes, every other SDK call and tool 120 s; a client that gives up never stops the job).

**Response (200):**

```json
{
  "result": {
    "status": "ok",
    "exitCode": 0,
    "durationMs": 5432,
    "tokens": null,
    "resultMeta": null,
    "stdoutTail": "Done",
    "stderrTail": "",
    "error": null
  }
}
```

`status` is `ok`, `error` or `timeout`.

**Errors:**

| Status | `code` | When |
| --- | --- | --- |
| `404` | `RUNNER_JOB_NOT_FOUND` | No job with that id |
| `409` | `RUNNER_MAX_CONCURRENCY` | The runner is at `maxConcurrency`; the trigger is refused and not recorded as a run |
| `500` | `RUNNER_TRIGGER_FAILED` | Any other failure. The message is fixed; the cause is in the runner log and, if the run started, on the run (`GET /jobs/:id/runs`), which is also alerted to the job's `on_failure` channel (else `notifications.defaultOnFailure`) like any other error run |

### `POST /jobs`

Create a new job. See the CLI Reference for field descriptions.

**Response (201):**

```json
{
  "ok": true,
  "id": "my-job"
}
```

**Errors:** `400 RUNNER_INVALID_SCHEDULE` (the schedule is neither a valid cron expression nor a valid RRStack; the message says why), `409 RUNNER_JOB_EXISTS` (a job already has that id; nothing is written).

### `PATCH /jobs/:id`

Partial update of an existing job. Only supplied fields are changed.

**Response (200):**

```json
{
  "ok": true
}
```

**Errors:** `404 RUNNER_JOB_NOT_FOUND`, `400 RUNNER_INVALID_SCHEDULE`. `DELETE /jobs/:id`, `enable`, `disable` and `script` below also answer `404 RUNNER_JOB_NOT_FOUND` for an unknown id.

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

---

## Queues

### `GET /queues`

List all queue names.

**Response:**

```json
{
  "queues": ["email-updates", "notifications"]
}
```

### `GET /queues/:name/status`

Queue depth, claimed count, failed count, and oldest pending age.

**Response:**

```json
{
  "depth": 5,
  "claimedCount": 2,
  "failedCount": 1,
  "oldestAge": 30000
}
```

| Field | Type | Description |
| --- | --- | --- |
| `depth` | `number` | Total pending items |
| `claimedCount` | `number` | Items currently being processed |
| `failedCount` | `number` | Items in failed state |
| `oldestAge` | `number \| null` | Age of oldest pending item in ms (null if empty) |

### `GET /queues/:name/peek`

Non-claiming read of pending items.

**Query Parameters:**

| Parameter | Type             | Default | Description             |
| --------- | ---------------- | ------- | ----------------------- |
| `limit`   | positive integer | `10`    | Maximum items to return |

**Response:**

```json
{
  "items": [
    {
      "id": 1,
      "payload": { "threadId": "abc123" },
      "priority": 0,
      "createdAt": "2026-03-02T01:00:00.000Z"
    }
  ]
}
```

**Errors:** `400 RUNNER_INVALID_QUEUE_PAYLOAD` when a pending item's stored payload is not JSON.

---

## State

### `GET /state`

List all state namespaces.

**Response:**

```json
{
  "namespaces": ["email", "github"]
}
```

### `GET /state/:namespace`

Read scalar state for a namespace as a key-value map. Supports optional `?path=` JSONPath filtering.

**Response:**

```json
{
  "lastRunAt": "2026-03-02T01:03:00.000Z",
  "cursor": null
}
```

### `GET /state/:namespace/:key`

Read a scalar value and its collection items.

**Query Parameters:**

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `limit` | positive integer | `100` | Maximum items to return |
| `order` | `asc` or `desc` | `desc` | Sort by last update |
| `path` | string | - | JSONPath over the body; the response is then `{ "result": [...], "count": n }`. An invalid one answers `400 RUNNER_INVALID_JSONPATH` (here and on `GET /state/:namespace`) |

**Response:**

```json
{
  "value": "parent-value",
  "items": [
    {
      "itemKey": "thread-123",
      "value": "seen",
      "updatedAt": "2026-03-02T01:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

## Errors

Every non-2xx response has Fastify's standard error body:

```json
{
  "statusCode": 409,
  "code": "RUNNER_MAX_CONCURRENCY",
  "error": "Conflict",
  "message": "Max concurrency reached; retry when a running job finishes."
}
```

`statusCode` repeats the HTTP status, `error` is its status text, `message` is written for the caller and `code` identifies the error. **Branch on `code`, never on `message`.** An unexpected failure is a `500` with a generic message and **no `code`**: the cause is logged, never sent.

The runner's codes (`RUNNER_ERROR_CODES` and `RUNNER_ERROR_STATUS` in `@karmaniverous/jeeves-runner-core`):

| `code` | Status | When |
| --- | --- | --- |
| `RUNNER_INVALID_SCHEDULE` | 400 | `POST /jobs` or `PATCH /jobs/:id` with a schedule that is neither a valid cron expression nor a valid RRStack; the message says why |
| `RUNNER_INVALID_JSONPATH` | 400 | `GET /state/:namespace[/:key]` with a `path` that is not valid JSONPath |
| `RUNNER_INVALID_QUEUE_PAYLOAD` | 400 | `GET /queues/:name/peek` reached a pending item whose stored payload is not JSON |
| `RUNNER_JOB_NOT_FOUND` | 404 | No job has the id in the path |
| `RUNNER_JOB_EXISTS` | 409 | `POST /jobs` with an id a job already has |
| `RUNNER_MAX_CONCURRENCY` | 409 | `POST /jobs/:id/run` refused at `maxConcurrency` (not recorded as a run) |
| `RUNNER_TRIGGER_FAILED` | 500 | `POST /jobs/:id/run` failed for any other reason; fixed message, the cause in the runner log and, if the run started, on the run |

Other codes you can see:

| `code` | Status | When |
| --- | --- | --- |
| `FST_ERR_VALIDATION` | 400 | A request fails the catalog's schemas; the message names the field (`body/name ...`, `querystring/limit ...`) |
| `FST_ERR_CTP_*`, `FST_ERR_MAX_PARAM_LENGTH` | 4xx | Fastify refuses the request itself (malformed JSON, unsupported content type, a path parameter over 100 characters) |
| `JEEVES_CONFIG_QUERY_INVALID` | 400 | `GET /config?path=` with an invalid JSONPath |
| `JEEVES_CONFIG_INVALID` | 400 | `POST /config/apply` with a patch that leaves the config invalid |
| `JEEVES_CONFIG_READ_FAILED`, `JEEVES_CONFIG_WRITE_FAILED` | 500 | `POST /config/apply` could not read or write the config file |
| `JEEVES_RESPONSE_VALIDATION` | 500 | The runner's own response failed its schema (a runner bug) |
| none | 404 | An unknown route (`Route GET:/x not found`) |
| none | 500 | Any other unexpected failure |

The runner sends no `429` or `503`, so no `Retry-After`.

### Changes in 0.14.0-1

Before 0.14.0-1 the runner's own errors were `{ "error": "<message>" }` and an unexpected error carried its own message. What a client sees now:

| Case | 0.14.0-0 | 0.14.0-1 |
| --- | --- | --- |
| Unknown job id (detail, update, delete, enable, disable, script) | `404 { error: 'Job not found' }` | `404 RUNNER_JOB_NOT_FOUND`, `Job not found: <id>` |
| Trigger: unknown job | `404 { error: 'Job not found: <id>' }` | `404 RUNNER_JOB_NOT_FOUND`, `Job not found: <id>` |
| Trigger at `maxConcurrency` | `409 { error: 'Max concurrency reached' }` | `409 RUNNER_MAX_CONCURRENCY` |
| Trigger: any other failure | `500 { error: '<the error's own text>' }` | `500 RUNNER_TRIGGER_FAILED`, fixed message |
| Invalid schedule | `400 { error: '<message>' }` | `400 RUNNER_INVALID_SCHEDULE`, same message |
| Duplicate job id | `500 ERR_SQLITE_ERROR`, `UNIQUE constraint failed: jobs.id` | `409 RUNNER_JOB_EXISTS` |
| Non-JSON queue payload | `500`, the JSON parser's text | `400 RUNNER_INVALID_QUEUE_PAYLOAD` |
| Invalid state JSONPath | `500`, the parser's text | `400 RUNNER_INVALID_JSONPATH` |
| Invalid config JSONPath | `400 { error: '<message>' }` | `400 JEEVES_CONFIG_QUERY_INVALID` |
| Invalid config patch | `400 { error: 'Config validation failed', issues }` | `400 JEEVES_CONFIG_INVALID` |
| Malformed request (body field, `limit`, `order`) | a route's `400 { error: <Zod message> }`, a `500`, or silently read | `400 FST_ERR_VALIDATION` |
| Any other unexpected error | `500`, the error's own message and code | `500`, generic message, no `code` |
