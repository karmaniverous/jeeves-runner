/**
 * Cron registration and reconciliation utilities.
 */

import type { DatabaseSync } from 'node:sqlite';

import { Cron } from 'croner';
import type { Logger } from 'pino';

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

export function createCronRegistry(deps: CronRegistryDeps): CronRegistry {
  const { db, logger, onScheduledRun } = deps;

  const crons = new Map<string, Cron>();
  const cronSchedules = new Map<string, string>();
  const failedRegistrations = new Set<string>();

  function registerCron(job: JobRow): boolean {
    try {
      const jobId = job.id;
      const cron = new Cron(job.schedule, () => {
        // Re-read job from DB to get current configuration
        const currentJob = db
          .prepare('SELECT * FROM jobs WHERE id = ? AND enabled = 1')
          .get(jobId) as JobRow | undefined;

        if (!currentJob) {
          logger.warn({ jobId }, 'Job no longer exists or disabled, skipping');
          return;
        }

        onScheduledRun(currentJob);
      });

      crons.set(job.id, cron);
      cronSchedules.set(job.id, job.schedule);
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
    for (const [jobId, cron] of crons.entries()) {
      if (!enabledById.has(jobId)) {
        cron.stop();
        crons.delete(jobId);
        cronSchedules.delete(jobId);
      }
    }

    const failedIds: string[] = [];

    // Add or update enabled jobs
    for (const job of enabledJobs) {
      const existingCron = crons.get(job.id);
      const existingSchedule = cronSchedules.get(job.id);

      if (!existingCron) {
        if (!registerCron(job)) failedIds.push(job.id);
        continue;
      }

      if (existingSchedule !== job.schedule) {
        existingCron.stop();
        crons.delete(job.id);
        cronSchedules.delete(job.id);
        if (!registerCron(job)) failedIds.push(job.id);
      }
    }

    return { totalEnabled: enabledJobs.length, failedIds };
  }

  function stopAll(): void {
    for (const cron of crons.values()) {
      cron.stop();
    }
    crons.clear();
    cronSchedules.clear();
  }

  return {
    reconcile,
    stopAll,
    getFailedRegistrations(): string[] {
      return Array.from(failedRegistrations);
    },
  };
}
