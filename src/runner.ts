/**
 * Main runner orchestrator. Wires up database, scheduler, API server, and handles graceful shutdown on SIGTERM/SIGINT.
 */

import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';

import { createServer } from './api/server.js';
import { closeConnection, createConnection } from './db/connection.js';
import { createMaintenance, type Maintenance } from './db/maintenance.js';
import { runMigrations } from './db/migrations.js';
import { createNotifier } from './notify/slack.js';
import { executeJob } from './scheduler/executor.js';
import { createScheduler, type Scheduler } from './scheduler/scheduler.js';
import type { RunnerConfig } from './schemas/config.js';

/** Runner interface for managing the runner lifecycle. */
export interface Runner {
  /** Initialize and start all runner components (database, scheduler, API server). */
  start(): Promise<void>;
  /** Gracefully stop all runner components and clean up resources. */
  stop(): Promise<void>;
}

/**
 * Create the runner. Initializes database, scheduler, API server, and sets up graceful shutdown.
 */
export function createRunner(config: RunnerConfig): Runner {
  let db: DatabaseSync | null = null;
  let scheduler: Scheduler | null = null;
  let server: FastifyInstance | null = null;
  let maintenance: Maintenance | null = null;

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

  return {
    async start(): Promise<void> {
      logger.info('Starting runner');

      // Database
      db = createConnection(config.dbPath);
      runMigrations(db);
      logger.info({ dbPath: config.dbPath }, 'Database ready');

      // Notifier
      const slackToken = config.notifications.slackTokenPath
        ? readFileSync(config.notifications.slackTokenPath, 'utf-8').trim()
        : null;
      const notifier = createNotifier({ slackToken });

      // Maintenance (run retention pruning + cursor cleanup)
      maintenance = createMaintenance(
        db,
        {
          runRetentionDays: config.runRetentionDays,
          cursorCleanupIntervalMs: config.cursorCleanupIntervalMs,
        },
        logger,
      );
      maintenance.start();
      logger.info('Maintenance tasks started');

      // Scheduler
      scheduler = createScheduler({
        db,
        executor: executeJob,
        notifier,
        config,
        logger,
      });
      scheduler.start();
      logger.info('Scheduler started');

      // API server
      server = createServer(config, { db, scheduler });
      await server.listen({ port: config.port, host: '127.0.0.1' });
      logger.info({ port: config.port }, 'API server listening');

      // Graceful shutdown
      const shutdown = async (signal: string): Promise<void> => {
        logger.info({ signal }, 'Received shutdown signal');
        await this.stop();
        process.exit(0);
      };

      process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
      });
      process.on('SIGINT', () => {
        void shutdown('SIGINT');
      });
    },

    async stop(): Promise<void> {
      logger.info('Stopping runner');

      if (maintenance) {
        maintenance.stop();
        logger.info('Maintenance stopped');
      }

      if (scheduler) {
        scheduler.stop();
        logger.info('Scheduler stopped');
      }

      if (server) {
        await server.close();
        logger.info('API server stopped');
      }

      if (db) {
        closeConnection(db);
        logger.info('Database closed');
      }
    },
  };
}
