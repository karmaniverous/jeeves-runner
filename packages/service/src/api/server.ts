/**
 * Fastify HTTP server for runner API. Creates server instance with logging, registers routes, listens on configured port (localhost only).
 *
 * @module
 */

import type { DatabaseSync } from 'node:sqlite';

import Fastify, { type FastifyInstance } from 'fastify';

import type { Scheduler } from '../scheduler/scheduler.js';
import type { RunnerConfig } from '../schemas/config.js';
import { registerRoutes } from './routes.js';

/** Server dependencies. */
interface ServerDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
  /** Getter for the current effective configuration. */
  getConfig: () => RunnerConfig;
  /** Service version string (from package.json). */
  version: string;
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

  registerRoutes(app, {
    db: deps.db,
    scheduler: deps.scheduler,
    getConfig: deps.getConfig,
    version: deps.version,
  });

  return app;
}
