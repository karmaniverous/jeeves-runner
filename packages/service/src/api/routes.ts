/**
 * Fastify API routes for job management and monitoring.
 *
 * Provides endpoints for job CRUD, run history, manual triggers,
 * system stats, config queries, and config apply.
 *
 * @module routes
 */

import type { DatabaseSync } from 'node:sqlite';

import {
  createConfigApplyHandler,
  createConfigQueryHandler,
  createStatusHandler,
  type JeevesComponentDescriptor,
} from '@karmaniverous/jeeves';
import type { FastifyInstance } from 'fastify';

import type { Scheduler } from '../scheduler/scheduler.js';
import type { RunnerConfig } from '../schemas/config.js';
import { registerJobRoutes } from './job-routes.js';
import { registerQueueRoutes } from './queue-routes.js';
import { registerStateRoutes } from './state-routes.js';

/** Route dependencies. */
interface RouteDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
  /** Getter for the current effective configuration. */
  getConfig: () => RunnerConfig;
  /** Component descriptor for factory-produced handlers. */
  descriptor: JeevesComponentDescriptor;
}

/**
 * Register all API routes on the Fastify instance.
 */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, scheduler, getConfig, descriptor } = deps;

  // --- GET /status (factory-produced) ---
  const statusHandler = createStatusHandler({
    name: 'runner',
    version: descriptor.version,
    getHealth: () => {
      const totalJobs = db
        .prepare('SELECT COUNT(*) as count FROM jobs')
        .get() as { count: number };
      const runningCount = scheduler.getRunningJobs().length;
      const failedCount = scheduler.getFailedRegistrations().length;
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

      return Promise.resolve({
        totalJobs: totalJobs.count,
        running: runningCount,
        failedRegistrations: failedCount,
        okLastHour: okLastHour.count,
        errorsLastHour: errorsLastHour.count,
      });
    },
  });

  app.get('/status', async (_request, reply) => {
    const result = await statusHandler();
    return reply.status(result.status).send(result.body);
  });

  // --- POST /config/apply (factory-produced) ---
  const configApplyHandler = createConfigApplyHandler(descriptor);

  app.post<{ Body: { patch: Record<string, unknown>; replace?: boolean } }>(
    '/config/apply',
    async (request, reply) => {
      const result = await configApplyHandler({
        patch: request.body.patch,
        replace: request.body.replace,
      });
      return reply.status(result.status).send(result.body);
    },
  );

  // --- GET /jobs ---
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

  // --- GET /jobs/:id ---
  app.get<{ Params: { id: string } }>('/jobs/:id', (request, reply) => {
    const job = db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: 'Job not found' };
    }
    return { job };
  });

  // --- GET /jobs/:id/runs ---
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

  // --- POST /jobs/:id/run ---
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

  // --- GET /config ---
  const configHandler = createConfigQueryHandler(getConfig);
  app.get<{ Querystring: { path?: string } }>(
    '/config',
    async (request, reply) => {
      const result = await configHandler({
        path: request.query.path,
      });
      return reply.status(result.status).send(result.body);
    },
  );

  // Register job CRUD routes (POST, PATCH, DELETE, PATCH enable/disable, PUT script)
  registerJobRoutes(app, { db, scheduler });

  // Register queue and state inspection routes
  registerQueueRoutes(app, { db });
  registerStateRoutes(app, { db });
}
