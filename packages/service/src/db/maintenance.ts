/**
 * Database maintenance tasks: run retention pruning and expired state cleanup.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { Logger } from 'pino';

/** Configuration for maintenance tasks. */
export interface MaintenanceConfig {
  /** Number of days to retain completed run records before pruning. */
  runRetentionDays: number;
  /** Interval in milliseconds between maintenance task runs. */
  stateCleanupIntervalMs: number;
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
  const cutoffDate = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const result = db
    .prepare(`DELETE FROM runs WHERE started_at < ?`)
    .run(cutoffDate);
  if (result.changes > 0) {
    logger.info({ deleted: result.changes }, 'Pruned old runs');
  }
}

/** Delete expired state entries. */
function cleanExpiredState(db: DatabaseSync, logger: Logger): void {
  const result = db
    .prepare(
      `DELETE FROM state WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`,
    )
    .run();
  if (result.changes > 0) {
    logger.info({ deleted: result.changes }, 'Cleaned expired state entries');
  }
}

/** Prune old queue items based on per-queue retention settings. */
function pruneOldQueueItems(db: DatabaseSync, logger: Logger): void {
  const result = db
    .prepare(
      `DELETE FROM queue_items 
       WHERE status IN ('done', 'failed') 
       AND finished_at < datetime('now', '-' || 
         COALESCE(
           (SELECT retention_days FROM queues WHERE queues.id = queue_items.queue_id),
           7
         ) || ' days')`,
    )
    .run();
  if (result.changes > 0) {
    logger.info({ deleted: result.changes }, 'Pruned old queue items');
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
    cleanExpiredState(db, logger);
    pruneOldQueueItems(db, logger);
  }

  return {
    start(): void {
      // Run immediately on startup
      runAll();
      // Then run periodically
      interval = setInterval(runAll, config.stateCleanupIntervalMs);
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
