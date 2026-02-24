/**
 * Fastify HTTP server for runner API. Creates server instance with logging, registers routes, listens on configured port (localhost only).
 */

import type { DatabaseSync } from 'node:sqlite';

import Fastify, { type FastifyInstance } from 'fastify';
import { pino } from 'pino';

import type { Scheduler } from '../scheduler/scheduler.js';
import type { RunnerConfig } from '../schemas/config.js';
import { registerRoutes } from './routes.js';

/** Server dependencies. */
interface ServerDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
}

/**
 * Create and configure the Fastify server. Routes are registered but server is not started.
 */
export function createServer(
  config: RunnerConfig,
  deps: ServerDeps,
): FastifyInstance {
  const logger = pino({
    level: config.log.level,
    ...(config.log.file
      ? {
          transport: {
            target: 'pino/file',
            options: { destination: config.log.file },
          },
        }
      : {}),
  });

  const app = Fastify({ logger });

  registerRoutes(app, deps);

  return app;
}
