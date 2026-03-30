---
title: Script Helper Utilities
---

# Script Helper Utilities

`@karmaniverous/jeeves-runner` exports a suite of helper utilities designed for use in runner job scripts. These were hoisted from the scripts template repo so every scripts project can import them from the runner package directly.

All utilities are exported from the package root:

```typescript
import {
  runScript,
  getRunnerClient,
  readJson,
  writeJsonAtomic,
  run,
  createGoogleAuth,
  dispatchSession,
  getChannelWorkspace,
} from '@karmaniverous/jeeves-runner';
```

---

## Script Lifecycle

### `runScript(name, fn, crashDir?)`

Wrap your script's entry point with crash handling. On uncaught errors, appends a timestamped entry to `_crash.log` in `crashDir` and exits with code 1.

```typescript
import { runScript, getRunnerClient } from '@karmaniverous/jeeves-runner';

runScript('email/poll-inbox', async () => {
  const jr = getRunnerClient();
  try {
    // ... script logic
  } finally {
    jr.close();
  }
});
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | — | Script identifier for crash logs |
| `fn` | `() => void \| Promise<void>` | — | Main function (sync or async) |
| `crashDir` | `string` | `process.cwd()` | Directory for `_crash.log` |

### `getRunnerClient(dbPath?)`

Create a runner SQLite client. Reads `JR_DB_PATH` from the environment (set automatically by the executor) or accepts an explicit path.

```typescript
const jr = getRunnerClient();
// or: const jr = getRunnerClient('/path/to/runner.sqlite');

jr.setState('email', 'lastPoll', new Date().toISOString());
const items = jr.dequeue('email-updates', 10);
jr.close();
```

Returns a `RunnerClient` with the full state/queue API (`getState`, `setState`, `deleteState`, `hasItem`, `getItem`, `setItem`, `deleteItem`, `countItems`, `pruneItems`, `listItemKeys`, `enqueue`, `dequeue`, `done`, `fail`, `close`).

---

## Filesystem Utilities

All from `fs-utils`:

### Time & UUID

| Function | Returns | Description |
|----------|---------|-------------|
| `nowIso()` | `string` | Current time as ISO 8601 |
| `uuid()` | `string` | Random UUID v4 |

### File I/O

| Function | Signature | Description |
|----------|-----------|-------------|
| `ensureDir(path)` | `void` | Create directory and parents |
| `readJson(path, fallback)` | `T` | Parse JSON file, return `fallback` on error |
| `writeJsonAtomic(path, obj)` | `void` | Write JSON via temp file + rename (atomic) |
| `appendJsonl(path, obj)` | `void` | Append one JSON object as a JSONL line |
| `readJsonl(path)` | `T[]` | Read JSONL file into array |
| `writeJsonl(path, entries)` | `void` | Overwrite file with array as JSONL |

```typescript
import { readJson, writeJsonAtomic, appendJsonl } from '@karmaniverous/jeeves-runner';

const cache = readJson('/path/to/cache.json', { items: [] });
cache.items.push({ id: 'new', ts: Date.now() });
writeJsonAtomic('/path/to/cache.json', cache);

appendJsonl('/path/to/audit.jsonl', { action: 'poll', ts: Date.now() });
```

### Process Control

| Function | Signature | Description |
|----------|-----------|-------------|
| `sleepMs(ms)` | `void` | Synchronous sleep via `Atomics.wait` |
| `sleepAsync(ms)` | `Promise<void>` | Async sleep via `setTimeout` |

### Environment & CLI

| Function | Signature | Description |
|----------|-----------|-------------|
| `loadEnvFile(path)` | `void` | Load `.env`-style key=value into `process.env` |
| `parseArgs(argv?)` | `Record<string, string>` | Parse `--key=value` args |
| `getArg(argv, name, default)` | `string` | Get value following a named flag |

---

## Shell Execution

### `run(cmd, args, opts?)`

Run a command synchronously and return trimmed stdout. Throws on non-zero exit.

```typescript
import { run } from '@karmaniverous/jeeves-runner';

const output = run('git', ['log', '--oneline', '-5']);
```

**Options:** `encoding`, `maxBuffer` (default 50 MB), `timeout`, `shell`.

### `runWithRetry(cmd, args, opts?)`

Run with automatic retries on transient failures. Uses exponential backoff.

```typescript
import { runWithRetry } from '@karmaniverous/jeeves-runner';

const result = runWithRetry('curl', ['-s', 'https://api.example.com/data'], {
  retries: 3,
  backoffMs: 2000,
});
```

**Additional options:** `retries` (default 2), `backoffMs` (default 5000), `isRetryable` (custom predicate; default matches timeout/deadline patterns).

---

## Google Auth

### `createGoogleAuth(options)`

Create a Google API auth helper that supports both OAuth refresh tokens and service account impersonation (domain-wide delegation).

```typescript
import { createGoogleAuth } from '@karmaniverous/jeeves-runner';
import type { AccountConfig } from '@karmaniverous/jeeves-runner';

const auth = createGoogleAuth({
  clientCredentialsPath: '/config/credentials/google/client.json',
  credentialsDir: '/config/credentials/google',
  serviceAccountDir: '/config/credentials/google/service-accounts',
});

// OAuth refresh token flow
const account: AccountConfig = {
  email: 'user@example.com',
  tokenFile: 'user-token.json',
};
const token = await auth.getAccessToken(account, ['https://www.googleapis.com/auth/gmail.readonly']);

// Service account impersonation
const saAccount: AccountConfig = {
  email: 'user@example.com',
  serviceAccount: { file: 'sa-key.json' },
};
const saToken = await auth.getAccessToken(saAccount, ['https://www.googleapis.com/auth/calendar']);
```

**`AccountConfig` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `email` | `string` | Google account email |
| `tokenFile` | `string?` | Path to refresh token JSON (relative to `credentialsDir`) |
| `serviceAccount` | `string \| { file: string }?` | Service account key path |

---

## Session Dispatch

### `dispatchSession(task, options, workerPath)`

Dispatch an LLM task via the OpenClaw Gateway. Pipes the task prompt to a worker script's stdin.

```typescript
import { dispatchSession } from '@karmaniverous/jeeves-runner';

const exitCode = await dispatchSession(
  'Summarize the latest email threads and write a digest.',
  {
    jobId: 'daily-digest',
    label: 'digest-2026-03-30',
    thinking: 'medium',
    timeout: 600,
  },
  '/config/scripts/spawn-worker.js',
);
```

### `runDispatcher(task, options, workerPath)`

Entry point helper for dispatcher scripts. Supports `--dry-run` for testing (prints config as JSON and exits).

```typescript
import { runDispatcher } from '@karmaniverous/jeeves-runner';

runDispatcher(
  'Generate social media posts from recent content.',
  { jobId: 'social-posts', thinking: 'high', timeout: 300 },
  '/config/scripts/spawn-worker.js',
);
```

**`DispatchOptions` fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `jobId` | `string` | — | Job identifier |
| `label` | `string?` | — | Session label |
| `thinking` | `'low' \| 'medium' \| 'high'` | — | LLM thinking level |
| `timeout` | `number` | `300` | Timeout in seconds |

---

## Slack Workspace Resolution

### `getChannelWorkspace(channelId, token, options)`

Resolve which Slack workspace owns a channel. Queries `conversations.info` and caches results to disk.

```typescript
import { getChannelWorkspace, saveSlackWorkspaceCache } from '@karmaniverous/jeeves-runner';

const teamId = await getChannelWorkspace('C0AGP3C8L2H', slackToken, {
  cachePath: '/state/runner/slack-workspace-cache.json',
  defaultWorkspace: 'T0AAD79ER2B',
});

// Flush cache to disk at end of script
saveSlackWorkspaceCache();
```

**`SlackWorkspaceOptions` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `cachePath` | `string` | Path to the cache JSON file |
| `defaultWorkspace` | `string` | Fallback team ID |

---

## Standard Script Pattern

Putting it all together — a typical runner job script:

```typescript
import {
  getRunnerClient,
  readJson,
  run,
  runScript,
  writeJsonAtomic,
} from '@karmaniverous/jeeves-runner';

runScript('domain/my-script', async () => {
  const jr = getRunnerClient();

  try {
    // Read state
    const lastRun = jr.getState('my-domain', 'lastRunAt');

    // Do work
    const data = run('curl', ['-s', 'https://api.example.com/updates']);
    const updates = JSON.parse(data) as unknown[];

    // Write results
    writeJsonAtomic('/domains/my-domain/latest.json', updates);

    // Update state
    jr.setState('my-domain', 'lastRunAt', new Date().toISOString());

    // Emit structured result
    console.log(`JR_RESULT:${JSON.stringify({ count: updates.length })}`);
  } finally {
    jr.close();
  }
});
```
