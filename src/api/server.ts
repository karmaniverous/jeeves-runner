/**
 * Fastify HTTP server for runner API. Creates server instance with logging, registers routes, listens on configured port (localhost only).
 */

import type { DatabaseSync } from 'node:sqlite';

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { Scheduler } from '../scheduler/scheduler.js';
import { registerRoutes } from './routes.js';

/** Server dependencies. */
interface ServerDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
  logger: Logger;
}

/**
 * Create and configure the Fastify server. Routes are registered but server is not started.
 */
export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger,
  });

  registerRoutes(app, deps);

  return app;
}
