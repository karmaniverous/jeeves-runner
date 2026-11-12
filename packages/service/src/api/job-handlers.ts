/**
 * Catalog handlers for the job mutations: create, update, delete, enable, disable and script update. The catalog validates bodies first (DD#87); the schedule check, the duplicate id and unknown jobs throw the runner's `defineError` errors (DD#96). Writes SQLite and asks the scheduler to reconcile.
 *
 * @module api/job-handlers
 */

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import type { UpdateJob } from '@karmaniverous/jeeves-runner-core';

import { toSqlInput } from '../lib/sql-input.js';
import { validateSchedule } from '../scheduler/schedule-utils.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import { capArg, InvalidSchedule, JobExists, jobNotFound } from './errors.js';
import { fromSync, OK } from './handler-utils.js';

/** Dependencies of the job handlers. */
export interface JobHandlerDeps {
  /** Runner database. */
  db: DatabaseSync;
  /** Scheduler, reconciled after every write. */
  scheduler: Scheduler;
}

/** An update field: its DB column and value transform. */
interface FieldMapping {
  input: keyof UpdateJob;
  column: string;
  transform?: (v: unknown) => SQLInputValue;
}

/** JSON text for env/args, or NULL. */
const jsonOrNull = (v: unknown): SQLInputValue =>
  v ? JSON.stringify(v) : null;

/** Update body field to DB column. */
const FIELD_MAP: readonly FieldMapping[] = [
  { input: 'name', column: 'name' },
  { input: 'schedule', column: 'schedule' },
  { input: 'script', column: 'script' },
  { input: 'source_type', column: 'source_type' },
  { input: 'type', column: 'type' },
  {
    input: 'timeout_seconds',
    column: 'timeout_ms',
    transform: (v) => (v as number) * 1000,
  },
  { input: 'overlap_policy', column: 'overlap_policy' },
  { input: 'enabled', column: 'enabled', transform: (v) => (v ? 1 : 0) },
  { input: 'description', column: 'description' },
  { input: 'on_failure', column: 'on_failure' },
  { input: 'on_success', column: 'on_success' },
  { input: 'output_channel', column: 'output_channel' },
  { input: 'env', column: 'env', transform: jsonOrNull },
  { input: 'args', column: 'args', transform: jsonOrNull },
];

/** SQLite's extended result code for a PRIMARY KEY violation. */
export const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

/**
 * Throw `RUNNER_INVALID_SCHEDULE` unless the schedule is valid.
 *
 * @param schedule - Cron or RRStack expression.
 * @throws `RUNNER_INVALID_SCHEDULE` with the check's message (capped).
 */
function checkSchedule(schedule: string): void {
  const validation = validateSchedule(schedule);
  if (!validation.valid) throw new InvalidSchedule(capArg(validation.error));
}

/**
 * Whether a thrown value is SQLite's PRIMARY KEY violation (`node:sqlite`
 * sets `errcode` to the extended result code).
 *
 * @param err - What `run()` threw.
 * @returns `true` for a duplicate primary key.
 */
export function isPrimaryKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { errcode?: unknown }).errcode === SQLITE_CONSTRAINT_PRIMARYKEY
  );
}

/**
 * Handlers for the job mutation entries.
 *
 * @param deps - Database and scheduler.
 * @returns Handlers keyed by entry name.
 */
export function createJobHandlers(deps: JobHandlerDeps) {
  const { db, scheduler } = deps;

  /** Set `enabled` on a job: OK, or `RUNNER_JOB_NOT_FOUND`. */
  const toggle = (id: string, enabled: number) => {
    const result = db
      .prepare('UPDATE jobs SET enabled = ? WHERE id = ?')
      .run(enabled, id);
    if (result.changes === 0) throw jobNotFound(id);
    scheduler.reconcileNow();
    return OK;
  };

  return fromSync({
    createJob: ({ body: data }) => {
      checkSchedule(data.schedule);

      const timeoutMs = data.timeout_seconds
        ? data.timeout_seconds * 1000
        : null;
      const insert = db.prepare(
        `INSERT INTO jobs (id, name, schedule, script, source_type, type, timeout_ms,
         overlap_policy, enabled, description, on_failure, on_success, output_channel, env, args)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      try {
        insert.run(
          data.id,
          data.name,
          data.schedule,
          data.script,
          data.source_type,
          data.type,
          timeoutMs,
          data.overlap_policy,
          data.enabled ? 1 : 0,
          data.description ?? null,
          data.on_failure ?? null,
          data.on_success ?? null,
          data.output_channel ?? null,
          jsonOrNull(data.env),
          jsonOrNull(data.args),
        );
      } catch (err) {
        if (isPrimaryKeyViolation(err)) throw new JobExists(capArg(data.id));
        throw err;
      }

      scheduler.reconcileNow();
      return { status: 201, body: { ok: true, id: data.id } } as const;
    },

    updateJob: ({ params, body: data }) => {
      const existing = db
        .prepare('SELECT id FROM jobs WHERE id = ?')
        .get(params.id);
      if (!existing) throw jobNotFound(params.id);

      if (data.schedule) checkSchedule(data.schedule);

      const sets: string[] = [];
      const values: SQLInputValue[] = [];
      for (const { input, column, transform } of FIELD_MAP) {
        if (data[input] !== undefined) {
          sets.push(`${column} = ?`);
          values.push(
            transform ? transform(data[input]) : toSqlInput(data[input]),
          );
        }
      }
      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        values.push(params.id);
        db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(
          ...values,
        );
      }

      scheduler.reconcileNow();
      return OK;
    },

    deleteJob: ({ params }) => {
      db.prepare('DELETE FROM runs WHERE job_id = ?').run(params.id);
      const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(params.id);
      if (result.changes === 0) throw jobNotFound(params.id);
      scheduler.reconcileNow();
      return OK;
    },

    enableJob: ({ params }) => toggle(params.id, 1),

    disableJob: ({ params }) => toggle(params.id, 0),

    updateScript: ({ params, body: data }) => {
      const result = data.source_type
        ? db
            .prepare('UPDATE jobs SET script = ?, source_type = ? WHERE id = ?')
            .run(data.script, data.source_type, params.id)
        : db
            .prepare('UPDATE jobs SET script = ? WHERE id = ?')
            .run(data.script, params.id);
      if (result.changes === 0) throw jobNotFound(params.id);
      scheduler.reconcileNow();
      return OK;
    },
  });
}
