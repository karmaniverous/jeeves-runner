---
title: OpenClaw Integration Guide
---

# OpenClaw Integration Guide

The `@karmaniverous/jeeves-runner-openclaw` plugin gives your OpenClaw agent access to jeeves-runner's job management, monitoring, and inspection capabilities.

## Installation

The plugin is a standard OpenClaw plugin. `jeeves install` / `jeeves update` (from `@karmaniverous/jeeves` 0.6+) install it and write its config. To install it by hand:

```bash
openclaw plugins install npm:@karmaniverous/jeeves-runner-openclaw@<version> --pin --accept-capabilities
```

There is no plugin-specific installer: the `npx @karmaniverous/jeeves-runner-openclaw install|uninstall` CLI was removed in favor of the OpenClaw CLI. Uninstall with `openclaw plugins uninstall jeeves-runner-openclaw`.

## Configuration

The plugin is configured via `plugins.entries` in `openclaw.json` (written by `jeeves install`):

```json
{
  "plugins": {
    "entries": {
      "jeeves-runner-openclaw": {
        "config": {
          "apiUrl": "http://127.0.0.1:1937",
          "configRoot": "J:/config"
        }
      }
    }
  }
}
```

| Key | Default | Description |
| --- | --- | --- |
| `apiUrl` | `http://127.0.0.1:1937` | Base URL of the jeeves-runner HTTP API (env fallback: `JEEVES_RUNNER_URL`) |
| `configRoot` | — | Jeeves platform config root (env fallback: `JEEVES_CONFIG_ROOT`) |

### configRoot is resolved lazily

`openclaw plugins install` activates the plugin before `jeeves install` writes its config, so registration never requires `configRoot`:

- Registration always succeeds. When `configRoot` is unset (neither plugin config nor `JEEVES_CONFIG_ROOT`), the plugin logs one warning.
- `configRoot` is resolved on first use; core is initialized then.
- The standard tools (`runner_status`, `runner_config`, `runner_config_apply`, `runner_service`) return a clear error naming both ways to set it until it resolves. The HTTP-only runner tools need just `apiUrl`.

## Platform Integration

The plugin writes no workspace files. Static platform content (the SOUL/AGENTS managed blocks) is rendered by `jeeves install`; live runner state is served by the tools (`runner_status`, `runner_jobs`, …). The consumer skill ships via the manifest's `skills` field.

## Available Tools

The plugin registers 20 tools: 4 standard platform tools (via `createPluginToolset`) plus 16 custom runner tools across three tiers.

### Standard Platform Tools

#### `runner_status`

Get service status including version, uptime, and health metrics (`{ name, version, uptime, status, health }`).

**Parameters:** None

#### `runner_config`

Query resolved service configuration. Supports optional JSONPath filtering.

**Parameters:** None (or optional JSONPath)

#### `runner_config_apply`

Apply a configuration patch to the running service.

| Parameter | Type      | Required | Description                              |
| --------- | --------- | -------- | ---------------------------------------- |
| `patch`   | `object`  | Yes      | Configuration fields to update           |
| `replace` | `boolean` | No       | Replace entire config instead of merging |

#### `runner_service`

System service management (install, uninstall, start, stop, restart, status).

| Parameter | Type     | Required | Description               |
| --------- | -------- | -------- | ------------------------- |
| `action`  | `string` | Yes      | Service action to perform |

### Custom Monitoring Tools

#### `runner_jobs`

List all jobs with enabled state, schedule, last run status, and last run time.

**Parameters:** None

#### `runner_trigger`

Manually trigger a job. Blocks until the job completes.

| Parameter | Type     | Required | Description           |
| --------- | -------- | -------- | --------------------- |
| `jobId`   | `string` | Yes      | The job ID to trigger |

#### `runner_runs`

Get recent run history for a job.

| Parameter | Type     | Required | Description                         |
| --------- | -------- | -------- | ----------------------------------- |
| `jobId`   | `string` | Yes      | The job ID                          |
| `limit`   | `number` | No       | Maximum runs to return (default 50) |

#### `runner_job_detail`

Get full configuration for a single job.

| Parameter | Type     | Required | Description |
| --------- | -------- | -------- | ----------- |
| `jobId`   | `string` | Yes      | The job ID  |

#### `runner_enable`

Enable a disabled job. Takes effect immediately.

| Parameter | Type     | Required | Description          |
| --------- | -------- | -------- | -------------------- |
| `jobId`   | `string` | Yes      | The job ID to enable |

#### `runner_disable`

Disable a job. It will not run until re-enabled.

| Parameter | Type     | Required | Description           |
| --------- | -------- | -------- | --------------------- |
| `jobId`   | `string` | Yes      | The job ID to disable |

### Management Tools

#### `runner_create_job`

Create a new runner job.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Unique job identifier |
| `name` | `string` | Yes | Human-readable name |
| `schedule` | `string` | Yes | Cron expression or RRStack JSON |
| `script` | `string` | Yes | Script path or inline content |
| `source_type` | `string` | No | `"path"` (default) or `"inline"` |
| `type` | `string` | No | `"script"` (default) or `"session"` |
| `timeout_seconds` | `number` | No | Kill after N seconds |
| `overlap_policy` | `string` | No | `"skip"` (default) or `"allow"` |
| `enabled` | `boolean` | No | Default: true |
| `description` | `string` | No | Job description |
| `on_failure` | `string` | No | Slack channel ID for failure alerts |
| `on_success` | `string` | No | Slack channel ID for success alerts |
| `output_channel` | `string` | No | Slack channel ID for stdout relay |
| `env` | `object` | No | `Record<string, string>` env vars spread into spawn env alongside `JR_*` vars. Script-type only. |
| `args` | `string[]` | No | Arguments appended after the script path in spawn. Script-type only. |

**Example:**

```json
{
  "id": "poll-email",
  "name": "Poll Email",
  "schedule": "*/11 * * * *",
  "script": "/path/to/scripts/poll-email.js",
  "on_failure": "C0123456789"
}
```

#### `runner_update_job`

Update an existing job. Only supplied fields are changed.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `jobId` | `string` | Yes | The job to update |
| _(others)_ |  | No | Any field from `runner_create_job` except `id` |

**Example:** Change schedule and timeout:

```json
{
  "jobId": "poll-email",
  "schedule": "*/5 * * * *",
  "timeout_seconds": 120
}
```

#### `runner_delete_job`

Delete a job and all its run history. **Irreversible.**

| Parameter | Type     | Required | Description       |
| --------- | -------- | -------- | ----------------- |
| `jobId`   | `string` | Yes      | The job to delete |

#### `runner_update_script`

Update a job's script content or path without changing other fields.

| Parameter     | Type     | Required | Description                       |
| ------------- | -------- | -------- | --------------------------------- |
| `jobId`       | `string` | Yes      | The job to update                 |
| `script`      | `string` | Yes      | New script path or inline content |
| `source_type` | `string` | No       | `"path"` or `"inline"`            |

### Inspection Tools

#### `runner_list_queues`

List all queues that have items.

**Parameters:** None

#### `runner_queue_status`

Get queue depth, claimed count, failed count, and oldest item age.

| Parameter   | Type     | Required | Description |
| ----------- | -------- | -------- | ----------- |
| `queueName` | `string` | Yes      | Queue name  |

#### `runner_queue_peek`

Non-claiming read of pending queue items.

| Parameter   | Type     | Required | Description            |
| ----------- | -------- | -------- | ---------------------- |
| `queueName` | `string` | Yes      | Queue name             |
| `limit`     | `number` | No       | Max items (default 10) |

#### `runner_list_namespaces`

List all state namespaces.

**Parameters:** None

#### `runner_query_state`

Read all scalar state for a namespace with optional JSONPath filtering.

| Parameter   | Type     | Required | Description         |
| ----------- | -------- | -------- | ------------------- |
| `namespace` | `string` | Yes      | State namespace     |
| `path`      | `string` | No       | JSONPath expression |

#### `runner_query_collection`

Read collection items for a state key within a namespace.

| Parameter   | Type     | Required | Description     |
| ----------- | -------- | -------- | --------------- |
| `namespace` | `string` | Yes      | State namespace |
| `key`       | `string` | Yes      | Collection key  |

## Skill

The plugin includes a consumer skill that teaches the agent how to operate the runner: checking status, investigating failures, triggering jobs, managing job lifecycle, and inspecting queues and state. The skill is automatically loaded when the plugin is installed.
