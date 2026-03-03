---
title: OpenClaw Integration Guide
---

# OpenClaw Integration Guide

The `@karmaniverous/jeeves-runner-openclaw` plugin gives your OpenClaw agent access to jeeves-runner's job management and monitoring capabilities.

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

The plugin reads the runner's base URL from the environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `JEEVES_RUNNER_URL` | `http://localhost:1937` | Base URL of the jeeves-runner HTTP API |

Set this in your OpenClaw environment if the runner is on a non-default port or host.

## Available Tools

The plugin registers 7 tools for interacting with the runner:

### `runner_status`

Get service health, uptime, job counts, and error statistics.

**Parameters:** None

**Returns:** Uptime, total jobs, running count, ok/error counts for the last hour.

### `runner_jobs`

List all jobs with enabled state, schedule, last run status, and last run time.

**Parameters:** None

**Returns:** Array of all registered jobs with their current state.

### `runner_trigger`

Manually trigger a job. Blocks until the job completes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID to trigger |

**Returns:** Run result including status, duration, exit code, and output.

### `runner_runs`

Get recent run history for a job.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID to get runs for |
| `limit` | `number` | No | Maximum runs to return (default 50) |

**Returns:** Array of recent runs with status, duration, exit code, and error details.

### `runner_job_detail`

Get full configuration for a single job.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID |

**Returns:** Complete job config including script path, schedule, timeout, and overlap policy.

### `runner_enable`

Enable a disabled job. Takes effect immediately.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID to enable |

### `runner_disable`

Disable a job. It will not run until re-enabled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | `string` | Yes | The job ID to disable |

## Skill

The plugin includes a consumer skill that teaches the agent how to operate the runner: checking status, investigating failures, triggering jobs, and interpreting run history. The skill is automatically loaded when the plugin is installed.
