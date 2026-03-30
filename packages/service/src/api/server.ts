/**
 * Fastify HTTP server for runner API.
 *
 * Creates server instance with logging, registers routes, listens
 * on configured port (localhost only).
 *
 * @module
 */

import type { DatabaseSync } from 'node:sqlite';

import type { JeevesComponentDescriptor } from '@karmaniverous/jeeves';
import Fastify, { type FastifyInstance } from 'fastify';

import type { LogConfig } from '../lib/pino-options.js';
import { buildPinoOptions } from '../lib/pino-options.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { RunnerConfig } from '../schemas/config.js';
import { registerRoutes } from './routes.js';

/** Server dependencies. */
interface ServerDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
  /** Getter for the current effective configuration. */
  getConfig: () => RunnerConfig;
  /** Component descriptor for factory-produced handlers. */
  descriptor: JeevesComponentDescriptor;
  /** Pino logger configuration. */
  logConfig: LogConfig;
}

/**
 * Create and configure the Fastify server.
 *
 * Routes are registered but server is not started.
 */
export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    logger: buildPinoOptions(deps.logConfig),
  });

  registerRoutes(app, {
    db: deps.db,
    scheduler: deps.scheduler,
    getConfig: deps.getConfig,
    descriptor: deps.descriptor,
  });

  return app;
}
