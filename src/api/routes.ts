/**
 * Fastify API routes for job management and monitoring. Provides endpoints for job CRUD, run history, manual triggers, and system stats.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { FastifyInstance } from 'fastify';

import type { Scheduler } from '../scheduler/scheduler.js';

/** Route dependencies. */
interface RouteDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
}

/**
 * Register all API routes on the Fastify instance.
 */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, scheduler } = deps;

  /** GET /health — Health check. */
  app.get('/health', () => {
    return { ok: true, uptime: process.uptime() };
  });

  /** GET /jobs — List all jobs with last run status. */
  app.get('/jobs', () => {
    const rows = db
      .prepare(
        `SELECT j.*, 
          (SELECT status FROM runs WHERE job_id = j.id ORDER BY started_at DESC LIMIT 1) as last_status,
          (SELECT started_at FROM runs WHERE job_id = j.id ORDER BY started_at DESC LIMIT 1) as last_run
         FROM jobs j`,
      )
      .all();
    return { jobs: rows };
  });

  /** GET /jobs/:id — Single job detail. */
  app.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const job = db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: 'Job not found' };
    }
    return { job };
  });

  /** GET /jobs/:id/runs — Run history for a job. */
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/jobs/:id/runs',
    (request) => {
      const limit = parseInt(request.query.limit ?? '50', 10);
      const runs = db
        .prepare(
          'SELECT * FROM runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?',
        )
        .all(request.params.id, limit);
      return { runs };
    },
  );

  /** POST /jobs/:id/run — Trigger manual job run. */
  app.post<{ Params: { id: string } }>(
    '/jobs/:id/run',
    async (request, reply) => {
      try {
        const result = await scheduler.triggerJob(request.params.id);
        return { result };
      } catch (err) {
        reply.code(404);
        return { error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
  );

  /** POST /jobs/:id/enable — Enable a job. */
  app.post<{ Params: { id: string } }>('/jobs/:id/enable', (request, reply) => {
    const result = db
      .prepare('UPDATE jobs SET enabled = 1 WHERE id = ?')
      .run(request.params.id);
    if (result.changes === 0) {
      reply.code(404);
      return { error: 'Job not found' };
    }
    return { ok: true };
  });

  /** POST /jobs/:id/disable — Disable a job. */
  app.post<{ Params: { id: string } }>(
    '/jobs/:id/disable',
    (request, reply) => {
      const result = db
        .prepare('UPDATE jobs SET enabled = 0 WHERE id = ?')
        .run(request.params.id);
      if (result.changes === 0) {
        reply.code(404);
        return { error: 'Job not found' };
      }
      return { ok: true };
    },
  );

  /** GET /stats — Aggregate job statistics. */
  app.get('/stats', () => {
    const totalJobs = db
      .prepare('SELECT COUNT(*) as count FROM jobs')
      .get() as { count: number };
    const runningCount = scheduler.getRunningJobs().length;
    const okLastHour = db
      .prepare(
        `SELECT COUNT(*) as count FROM runs 
         WHERE status = 'ok' AND started_at > datetime('now', '-1 hour')`,
      )
      .get() as { count: number };
    const errorsLastHour = db
      .prepare(
        `SELECT COUNT(*) as count FROM runs 
         WHERE status IN ('error', 'timeout') AND started_at > datetime('now', '-1 hour')`,
      )
      .get() as { count: number };

    return {
      totalJobs: totalJobs.count,
      running: runningCount,
      okLastHour: okLastHour.count,
      errorsLastHour: errorsLastHour.count,
    };
  });
}
