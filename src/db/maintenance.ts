/**
 * Database maintenance tasks: run retention pruning and expired cursor cleanup.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { Logger } from 'pino';

/** Configuration for maintenance tasks. */
export interface MaintenanceConfig {
  /** Number of days to retain completed run records before pruning. */
  runRetentionDays: number;
  /** Interval in milliseconds between maintenance task runs. */
  cursorCleanupIntervalMs: number;
}

/** Maintenance controller with start/stop lifecycle. */
export interface Maintenance {
  /** Start maintenance tasks (runs immediately, then on interval). */
  start(): void;
  /** Stop maintenance task interval. */
  stop(): void;
  /** Run all maintenance tasks immediately (useful for testing and startup). */
  runNow(): void;
}

/** Delete runs older than the configured retention period. */
function pruneOldRuns(db: DatabaseSync, days: number, logger: Logger): void {
  const result = db
    .prepare(
      `DELETE FROM runs WHERE started_at < datetime('now', '-${String(days)} days')`,
    )
    .run();
  if (result.changes > 0) {
    logger.info({ deleted: result.changes }, 'Pruned old runs');
  }
}

/** Delete expired cursor entries. */
function cleanExpiredCursors(db: DatabaseSync, logger: Logger): void {
  const result = db
    .prepare(
      `DELETE FROM cursors WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`,
    )
    .run();
  if (result.changes > 0) {
    logger.info({ deleted: result.changes }, 'Cleaned expired cursors');
  }
}

/**
 * Create the maintenance controller. Runs cleanup tasks on startup and at configured intervals.
 */
export function createMaintenance(
  db: DatabaseSync,
  config: MaintenanceConfig,
  logger: Logger,
): Maintenance {
  let interval: NodeJS.Timeout | null = null;

  function runAll(): void {
    pruneOldRuns(db, config.runRetentionDays, logger);
    cleanExpiredCursors(db, logger);
  }

  return {
    start(): void {
      // Run immediately on startup
      runAll();
      // Then run periodically
      interval = setInterval(runAll, config.cursorCleanupIntervalMs);
    },

    stop(): void {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },

    runNow(): void {
      runAll();
    },
  };
}
