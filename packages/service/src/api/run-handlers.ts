/**
 * Catalog handlers for reading jobs and running them: list, detail, run history and manual trigger (DD#79, DD#80). SQL unchanged from 0.14.0-0; rows are sent as read and checked against the catalog's row schemas on the way out. Reads SQLite; `triggerJob` runs the job through the scheduler.
 *
 * @module api/run-handlers
 */

import type { DatabaseSync } from 'node:sqlite';

import type {
  JobListRow,
  JobRow,
  RunRow,
} from '@karmaniverous/jeeves-runner-core';

import { JobNotFoundError, MaxConcurrencyError } from '../scheduler/errors.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import {
  fromSync,
  JOB_NOT_FOUND,
  type RunnerHandlers,
} from './handler-utils.js';

/** Dependencies of the job read and trigger handlers. */
export interface RunHandlerDeps {
  /** Runner database. */
  db: DatabaseSync;
  /** Scheduler that runs triggered jobs. */
  scheduler: Scheduler;
}

/** Default `limit` of `GET /jobs/:id/runs`. */
const DEFAULT_RUNS_LIMIT = 50;

/**
 * HTTP status for a failed trigger: 404 unknown job; 409 refused at
 * `maxConcurrency` (not recorded as a run); 500 otherwise (#118, DD#80).
 *
 * @param err - What `triggerJob` rejected with.
 * @returns The status.
 */
export function triggerErrorStatus(err: unknown): 404 | 409 | 500 {
  if (err instanceof JobNotFoundError) return 404;
  if (err instanceof MaxConcurrencyError) return 409;
  return 500;
}

/**
 * Handlers for the job read and trigger entries.
 *
 * @param deps - Database and scheduler.
 * @returns Handlers keyed by entry name.
 */
export function createRunHandlers(
  deps: RunHandlerDeps,
): Pick<RunnerHandlers, 'listJobs' | 'jobDetail' | 'jobRuns' | 'triggerJob'> {
  const { db, scheduler } = deps;

  const sync = fromSync({
    listJobs: () => {
      const rows = db
        .prepare(
          `SELECT j.*,
            (SELECT status FROM runs WHERE job_id = j.id ORDER BY started_at DESC LIMIT 1) as last_status,
            (SELECT started_at FROM runs WHERE job_id = j.id ORDER BY started_at DESC LIMIT 1) as last_run
           FROM jobs j`,
        )
        .all() as unknown as JobListRow[];
      return { status: 200, body: { jobs: rows } } as const;
    },

    jobDetail: ({ params }) => {
      const job = db
        .prepare('SELECT * FROM jobs WHERE id = ?')
        .get(params.id) as JobRow | undefined;
      if (!job) return JOB_NOT_FOUND;
      return { status: 200, body: { job } } as const;
    },

    jobRuns: ({ params, query }) => {
      const runs = db
        .prepare(
          'SELECT * FROM runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?',
        )
        .all(
          params.id,
          query.limit ?? DEFAULT_RUNS_LIMIT,
        ) as unknown as RunRow[];
      return { status: 200, body: { runs } } as const;
    },
  });

  return {
    ...sync,
    triggerJob: async ({ params }) => {
      try {
        const result = await scheduler.triggerJob(params.id);
        return { status: 200, body: { result } } as const;
      } catch (err) {
        return {
          status: triggerErrorStatus(err),
          body: {
            error: err instanceof Error ? err.message : 'Unknown error',
          },
        } as const;
      }
    },
  };
}
