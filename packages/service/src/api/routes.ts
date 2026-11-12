/**
 * The runner's HTTP API: every route of `RUNNER_CATALOG`, registered by jeeves `registerCatalogRoutes` with request and response validation (DD#87), plus `GET /openapi.json` (no auth; DD#93).
 *
 * @remarks
 * `registerRoutes` stays synchronous: the catalog routes go in a child
 * plugin, so a registration error surfaces from `ready()`/`listen()`.
 * Responses are validated `strict`ly: a body that does not match its schema
 * is logged and answered 500 `JEEVES_RESPONSE_VALIDATION` (DD#87 item c).
 *
 * Errors (DD#96): jeeves' catalog scope answers every error on catalog
 * routes, and `registerErrorHandlers` gives the other routes
 * (`/openapi.json`, unknown routes) the same rule: a `defineError` error
 * (`api/errors.ts`) or a Fastify 4xx is sent as Fastify's standard body,
 * anything else is a logged, masked 500. Fastify runs with the service's
 * pino logger, so jeeves logs through it (no `logger` option needed).
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
import {
  registerCatalogRoutes,
  registerErrorHandlers,
  registerOpenApiRoute,
  standardHandlers,
} from '@karmaniverous/jeeves/fastify';
import {
  RUNNER_CATALOG,
  RUNNER_OPENAPI_DOCUMENT,
  type RunnerHealth,
} from '@karmaniverous/jeeves-runner-core';
import type { FastifyInstance } from 'fastify';

import type { Scheduler } from '../scheduler/scheduler.js';
import type { RunnerConfig } from '../schemas/config.js';
import type { RunnerHandlers } from './handler-utils.js';
import { createInspectHandlers } from './inspect-handlers.js';
import { createJobHandlers } from './job-handlers.js';
import { createRunHandlers } from './run-handlers.js';

/** Route dependencies. */
interface RouteDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
  /** Getter for the current effective configuration. */
  getConfig: () => RunnerConfig;
  /** Component descriptor for factory-produced handlers. */
  descriptor: JeevesComponentDescriptor;
  /**
   * Absolute path of the config file the service was started with.
   * When set, `POST /config/apply` writes here (temp file in the same
   * directory) instead of deriving a path from the core config root.
   */
  configPath?: string;
}

/**
 * The runner's `health` block for `GET /status`.
 *
 * @param db - Runner database.
 * @param scheduler - Scheduler (running jobs, failed registrations).
 * @returns Job and run counts.
 */
function readHealth(db: DatabaseSync, scheduler: Scheduler): RunnerHealth {
  const count = (sql: string) =>
    (db.prepare(sql).get() as { count: number }).count;
  return {
    totalJobs: count('SELECT COUNT(*) as count FROM jobs'),
    running: scheduler.getRunningJobs().length,
    failedRegistrations: scheduler.getFailedRegistrations().length,
    okLastHour: count(
      `SELECT COUNT(*) as count FROM runs
       WHERE status = 'ok' AND started_at > datetime('now', '-1 hour')`,
    ),
    errorsLastHour: count(
      `SELECT COUNT(*) as count FROM runs
       WHERE status IN ('error', 'timeout') AND started_at > datetime('now', '-1 hour')`,
    ),
  };
}

/**
 * One handler per catalog entry: jeeves' standard handlers for `status`,
 * `config` and `configApply`, the runner's own for the rest.
 *
 * @param deps - Route dependencies.
 * @returns The handlers.
 */
export function createRunnerHandlers(deps: RouteDeps): RunnerHandlers {
  const { db, scheduler, getConfig, descriptor, configPath } = deps;
  return {
    ...standardHandlers({
      status: createStatusHandler({
        name: 'runner',
        version: descriptor.version,
        getHealth: () => Promise.resolve(readHealth(db, scheduler)),
      }),
      config: createConfigQueryHandler(getConfig),
      configApply: createConfigApplyHandler(descriptor, configPath),
    }),
    ...createRunHandlers({ db, scheduler }),
    ...createJobHandlers({ db, scheduler }),
    ...createInspectHandlers({ db }),
  };
}

/**
 * Register all API routes on the Fastify instance.
 *
 * @param app - Fastify app.
 * @param deps - Route dependencies.
 */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const handlers = createRunnerHandlers(deps);
  registerErrorHandlers(app);
  void app.register(async (child) => {
    await registerCatalogRoutes(child, RUNNER_CATALOG, handlers, {
      responseValidation: 'strict',
    });
  });
  registerOpenApiRoute(app, RUNNER_OPENAPI_DOCUMENT);
}
