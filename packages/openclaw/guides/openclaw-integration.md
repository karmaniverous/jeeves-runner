---
title: OpenClaw Integration Guide
---

# OpenClaw Integration Guide

The `@karmaniverous/jeeves-runner-openclaw` plugin gives your OpenClaw agent access to jeeves-runner's job management, monitoring, and inspection capabilities.

## Installation

### Standard (OpenClaw CLI)

```bash
openclaw plugins install @karmaniverous/jeeves-runner-openclaw
```

### Self-Installer

OpenClaw's `plugins install` command has a known bug on Windows where it fails with `spawn EINVAL` or `spawn npm ENOENT` ([#9224](https://github.com/openclaw/openclaw/issues/9224), [#4557](https://github.com/openclaw/openclaw/issues/4557), [#6086](https://github.com/openclaw/openclaw/issues/6086)). This package includes a self-installer that works around the issue:

```bash
npx @karmaniverous/jeeves-runner-openclaw install
```

The installer:

1. Copies the plugin into OpenClaw's extensions directory (`~/.openclaw/extensions/jeeves-runner-openclaw/`)
2. Adds the plugin to `plugins.entries` in `openclaw.json`
3. If `plugins.allow` or `tools.allow` are already populated (explicit allowlists), adds the plugin to those lists

To remove:

```bash
npx @karmaniverous/jeeves-runner-openclaw uninstall
```

#### Non-default installations

If OpenClaw is installed at a non-default location, set one of these environment variables:

| Variable | Description |
|----------|-------------|
| `OPENCLAW_CONFIG` | Full path to `openclaw.json` (overrides all other detection) |
| `OPENCLAW_HOME` | Path to the `.openclaw` directory |

Default location: `~/.openclaw/openclaw.json`

After install or uninstall, restart the OpenClaw gateway to apply changes.

## Configuration

The plugin is configured via `plugins.entries` in `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "@karmaniverous/jeeves-runner-openclaw": {
        "config": {
          "apiUrl": "http://127.0.0.1:1937",
          "configRoot": "J:/jeeves"
        }
      }
    }
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `apiUrl` | `http://127.0.0.1:1937` | Base URL of the jeeves-runner HTTP API |
| `configRoot` | — | Root directory for platform content (TOOLS.md, skills) |

## Platform Integration

The plugin uses `@karmaniverous/jeeves` core's `ComponentWriter` to manage platform content:

- **TOOLS.md section** — Writes a `## Runner` section into TOOLS.md with service health, connected status, and tool descriptions. Updated on gateway startup.
- **Platform content** — Can contribute to SOUL.md, AGENTS.md, and other platform files via the `configRoot` directory.

This replaces the previous `JEEVES_RUNNER_URL` environment variable approach.

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

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patch` | `object` | Yes | Configuration fields to update |
| `replace` | `boolean` | No | Replace entire config instead of merging |

#### `runner_service`

System service management (install, uninstall, start, stop, restart, status).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `string` | Yes | Service action to perform |

### Custom Monitoring Tools

#### `runner_jobs`

List all jobs with enabled state, schedule, last run status, and last run time.

**Parameters:** None

#### `runner_trigger`

Manually trigger a job. Blocks until the job completes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID to trigger |

#### `runner_runs`

Get recent run history for a job.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID |
| `limit` | `number` | No | Maximum runs to return (default 50) |

#### `runner_job_detail`

Get full configuration for a single job.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID |

#### `runner_enable`

Enable a disabled job. Takes effect immediately.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID to enable |

#### `runner_disable`

Disable a job. It will not run until re-enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID to disable |

### Management Tools

#### `runner_create_job`

Create a new runner job.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
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
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job to update |
| *(others)* | | No | Any field from `runner_create_job` except `id` |

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

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job to delete |

#### `runner_update_script`

Update a job's script content or path without changing other fields.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job to update |
| `script` | `string` | Yes | New script path or inline content |
| `source_type` | `string` | No | `"path"` or `"inline"` |

### Inspection Tools

#### `runner_list_queues`

List all queues that have items.

**Parameters:** None

#### `runner_queue_status`

Get queue depth, claimed count, failed count, and oldest item age.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `queueName` | `string` | Yes | Queue name |

#### `runner_queue_peek`

Non-claiming read of pending queue items.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `queueName` | `string` | Yes | Queue name |
| `limit` | `number` | No | Max items (default 10) |

#### `runner_list_namespaces`

List all state namespaces.

**Parameters:** None

#### `runner_query_state`

Read all scalar state for a namespace with optional JSONPath filtering.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | `string` | Yes | State namespace |
| `path` | `string` | No | JSONPath expression |

#### `runner_query_collection`

Read collection items for a state key within a namespace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | `string` | Yes | State namespace |
| `key` | `string` | Yes | Collection key |

## Skill

The plugin includes a consumer skill that teaches the agent how to operate the runner: checking status, investigating failures, triggering jobs, managing job lifecycle, and inspecting queues and state. The skill is automatically loaded when the plugin is installed.
