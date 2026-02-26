/**
 * Fastify HTTP server for runner API. Creates server instance with logging, registers routes, listens on configured port (localhost only).
 */

import type { DatabaseSync } from 'node:sqlite';

import Fastify, { type FastifyInstance } from 'fastify';

import type { Scheduler } from '../scheduler/scheduler.js';
import { registerRoutes } from './routes.js';

/** Server dependencies. */
interface ServerDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
  /** Pino logger config or false to disable. */
  loggerConfig?: { level: string; file?: string };
}

/**
 * Create and configure the Fastify server. Routes are registered but server is not started.
 */
export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.loggerConfig
      ? {
          level: deps.loggerConfig.level,
          ...(deps.loggerConfig.file
            ? {
                transport: {
                  target: 'pino/file',
                  options: { destination: deps.loggerConfig.file },
                },
              }
            : {}),
        }
      : false,
  });

  registerRoutes(app, deps);

  return app;
}
