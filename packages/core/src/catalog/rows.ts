/**
 * Response schemas for the runner API as the routes send it today (DD#88): SQLite rows from `SELECT *` (snake_case, `enabled` as 0/1, `env`/`args` as JSON text, nullable where the column is), run results, queue and state bodies. Field order is the order the routes send. Pure.
 *
 * @module catalog/rows
 */

import { z } from 'zod';

/** A nullable SQLite TEXT column. */
const text = () => z.string().nullable();
/** A nullable SQLite INTEGER column holding whole numbers (ids, flags, exit codes). */
const integer = () => z.number().int().nullable();
/**
 * A nullable SQLite INTEGER column that can hold a fraction: SQLite keeps a
 * non-integer number as REAL (e.g. `timeout_seconds: 1.5` stores 1500.0,
 * a fractional queue priority stays fractional).
 */
const numeric = () => z.number().nullable();

/** A `jobs` row as sent by `GET /jobs/:id` (column order). */
export const jobRowSchema = z.object({
  /** Unique job identifier. */
  id: z.string(),
  /** Human-readable job name. */
  name: z.string(),
  /** Cron or RRStack schedule expression. */
  schedule: z.string(),
  /** Script path or inline source. */
  script: z.string(),
  /** `script` or `session`. */
  type: text(),
  /** Job description. */
  description: text(),
  /** 1 enabled, 0 disabled. */
  enabled: integer(),
  /** Timeout in milliseconds. */
  timeout_ms: numeric(),
  /** `skip` or `allow`. */
  overlap_policy: text(),
  /** Slack channel for failure alerts. */
  on_failure: text(),
  /** Slack channel for success alerts. */
  on_success: text(),
  /** SQLite timestamp. */
  created_at: text(),
  /** SQLite timestamp. */
  updated_at: text(),
  /** `path` or `inline`. */
  source_type: text(),
  /** Output channel for session results. */
  output_channel: text(),
  /** Environment variables as JSON text. */
  env: text(),
  /** Arguments as JSON text. */
  args: text(),
});

/** A `jobs` row as sent by `GET /jobs`: the row plus its latest run. */
export const jobListRowSchema = jobRowSchema.extend({
  /** Status of the most recent run (null if never run). */
  last_status: text(),
  /** Start of the most recent run (null if never run). */
  last_run: text(),
});

/** A `runs` row as sent by `GET /jobs/:id/runs` (column order). */
export const runRowSchema = z.object({
  /** Run id. */
  id: z.number().int(),
  /** Job id. */
  job_id: z.string(),
  /** `pending`, `running`, `ok`, `error`, `timeout` or `skipped`. */
  status: z.string(),
  /** SQLite timestamp. */
  started_at: text(),
  /** SQLite timestamp. */
  finished_at: text(),
  /** Duration in milliseconds. */
  duration_ms: numeric(),
  /** Process exit code. */
  exit_code: integer(),
  /** Token count (session jobs, or `JR_RESULT`). */
  tokens: numeric(),
  /** Result metadata. */
  result_meta: text(),
  /** Error message. */
  error: text(),
  /** Tail of stdout. */
  stdout_tail: text(),
  /** Tail of stderr. */
  stderr_tail: text(),
  /** `schedule` or `manual`. */
  trigger: text(),
});

/** The result of a finished run, as `POST /jobs/:id/run` sends it. */
export const executionResultSchema = z.object({
  /** Outcome. */
  status: z.enum(['ok', 'error', 'timeout']),
  /** Process exit code (null on timeout, spawn error or session jobs). */
  exitCode: z.number().int().nullable(),
  /** Duration in milliseconds. */
  durationMs: z.number(),
  /** Token count (session jobs, or `JR_RESULT`). */
  tokens: z.number().nullable(),
  /** Result metadata. */
  resultMeta: z.string().nullable(),
  /** Tail of stdout. */
  stdoutTail: z.string(),
  /** Tail of stderr. */
  stderrTail: z.string(),
  /** Error message. */
  error: z.string().nullable(),
});

/** The runner's `health` block in `GET /status`. */
export const runnerHealthSchema = z.object({
  /** Number of jobs. */
  totalJobs: z.number().int(),
  /** Jobs running now. */
  running: z.number().int(),
  /** Jobs whose schedule failed to register. */
  failedRegistrations: z.number().int(),
  /** Runs finished `ok` in the last hour. */
  okLastHour: z.number().int(),
  /** Runs finished `error` or `timeout` in the last hour. */
  errorsLastHour: z.number().int(),
});

/** `{ ok: true }`. */
export const okResponseSchema = z.object({ ok: z.literal(true) });

/** JSONPath matches: `{ result, count }`. Strict, so a state map whose keys happen to be `result` and `count` is never read as one. */
export const jsonPathResultSchema = z.strictObject({
  /** Matches. */
  result: z.array(z.unknown()),
  /** Number of matches. */
  count: z.number().int(),
});

/** A pending queue item as `GET /queues/:name/peek` sends it. */
export const queuePeekItemSchema = z.object({
  /** Item id. */
  id: z.number().int(),
  /** Parsed JSON payload. */
  payload: z.unknown(),
  /** Priority (higher first). */
  priority: numeric(),
  /** SQLite timestamp. */
  createdAt: text(),
});

/** A state collection item as `GET /state/:namespace/:key` sends it. */
export const stateCollectionItemSchema = z.object({
  /** Item key. */
  itemKey: z.string(),
  /** Item value. */
  value: text(),
  /** SQLite timestamp. */
  updatedAt: text(),
});

/** `GET /state/:namespace/:key` without `path`. */
export const collectionBodySchema = z.object({
  /** Scalar state value for the key. */
  value: text(),
  /** Collection items. */
  items: z.array(stateCollectionItemSchema),
  /** Number of items. */
  count: z.number().int(),
});

/** `GET /queues/:name/status`. */
export const queueStatusSchema = z.object({
  /** Pending items. */
  depth: z.number().int(),
  /** Items being processed. */
  claimedCount: z.number().int(),
  /** Failed items. */
  failedCount: z.number().int(),
  /** Age of the oldest pending item in milliseconds (null when none). */
  oldestAge: z.number().nullable(),
});
