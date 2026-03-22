/**
 * Schedule registration and reconciliation. Supports cron (croner) and RRStack schedule formats via unified setTimeout-based scheduling.
 *
 * @module
 */

import type { DatabaseSync } from 'node:sqlite';

import type { Logger } from 'pino';

import { getNextFireTime } from './schedule-utils.js';

/** Job record from database (shape used by scheduler). */
export interface JobRow {
  id: string;
  name: string;
  schedule: string;
  script: string;
  type: 'script' | 'session';
  timeout_ms: number | null;
  overlap_policy: 'skip' | 'allow';
  on_failure: string | null;
  on_success: string | null;
  source_type?: 'path' | 'inline';
}

/** Handle for a scheduled job (timeout-based). */
interface ScheduleHandle {
  /** Cancel the pending timeout. */
  cancel: () => void;
}

export interface CronRegistry {
  reconcile(): { totalEnabled: number; failedIds: string[] };
  stopAll(): void;
  getFailedRegistrations(): string[];
}

export interface CronRegistryDeps {
  db: DatabaseSync;
  logger: Logger;
  onScheduledRun: (job: JobRow) => void;
}

/** Maximum setTimeout delay (Node.js limit: ~24.8 days). */
const MAX_TIMEOUT_MS = 2_147_483_647;

export function createCronRegistry(deps: CronRegistryDeps): CronRegistry {
  const { db, logger, onScheduledRun } = deps;

  const handles = new Map<string, ScheduleHandle>();
  const scheduleStrings = new Map<string, string>();
  const failedRegistrations = new Set<string>();

  /**
   * Schedule the next fire for a job. Computes next fire time, sets a
   * setTimeout, and re-arms after each fire.
   */
  function scheduleNext(jobId: string, schedule: string): void {
    const nextDate = getNextFireTime(schedule);
    if (!nextDate) {
      logger.warn({ jobId }, 'No upcoming fire time, job will not fire');
      return;
    }

    const delayMs = Math.max(0, nextDate.getTime() - Date.now());

    // Node.js setTimeout max is ~24.8 days. If delay exceeds that,
    // set an intermediate wakeup and re-check.
    const effectiveDelay = Math.min(delayMs, MAX_TIMEOUT_MS);
    const isIntermediate = delayMs > MAX_TIMEOUT_MS;

    const timeout = setTimeout(() => {
      if (isIntermediate) {
        // Woke up early just to re-check; schedule again.
        scheduleNext(jobId, schedule);
        return;
      }

      // Re-read job from DB to get current configuration
      const currentJob = db
        .prepare('SELECT * FROM jobs WHERE id = ? AND enabled = 1')
        .get(jobId) as JobRow | undefined;

      if (!currentJob) {
        logger.warn({ jobId }, 'Job no longer exists or disabled, skipping');
        return;
      }

      onScheduledRun(currentJob);

      // Re-arm for the next occurrence
      scheduleNext(jobId, schedule);
    }, effectiveDelay);

    handles.set(jobId, {
      cancel: () => {
        clearTimeout(timeout);
      },
    });
  }

  function registerSchedule(job: JobRow): boolean {
    try {
      scheduleNext(job.id, job.schedule);
      scheduleStrings.set(job.id, job.schedule);
      failedRegistrations.delete(job.id);
      logger.info({ jobId: job.id, schedule: job.schedule }, 'Scheduled job');
      return true;
    } catch (err) {
      logger.error({ jobId: job.id, err }, 'Failed to schedule job');
      failedRegistrations.add(job.id);
      return false;
    }
  }

  function reconcile(): { totalEnabled: number; failedIds: string[] } {
    const enabledJobs = db
      .prepare('SELECT * FROM jobs WHERE enabled = 1')
      .all() as unknown as JobRow[];

    const enabledById = new Map(enabledJobs.map((j) => [j.id, j] as const));

    // Remove disabled/deleted jobs
    for (const [jobId, handle] of handles.entries()) {
      if (!enabledById.has(jobId)) {
        handle.cancel();
        handles.delete(jobId);
        scheduleStrings.delete(jobId);
      }
    }

    const failedIds: string[] = [];

    // Add or update enabled jobs
    for (const job of enabledJobs) {
      const existingHandle = handles.get(job.id);
      const existingSchedule = scheduleStrings.get(job.id);

      if (!existingHandle) {
        if (!registerSchedule(job)) failedIds.push(job.id);
        continue;
      }

      if (existingSchedule !== job.schedule) {
        existingHandle.cancel();
        handles.delete(job.id);
        scheduleStrings.delete(job.id);
        if (!registerSchedule(job)) failedIds.push(job.id);
      }
    }

    return { totalEnabled: enabledJobs.length, failedIds };
  }

  function stopAll(): void {
    for (const handle of handles.values()) {
      handle.cancel();
    }
    handles.clear();
    scheduleStrings.clear();
  }

  return {
    reconcile,
    stopAll,
    getFailedRegistrations(): string[] {
      return Array.from(failedRegistrations);
    },
  };
}
