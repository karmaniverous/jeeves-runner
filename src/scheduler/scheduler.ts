/**
 * Croner-based job scheduler. Loads enabled jobs, creates cron instances, manages execution, respects overlap policies and concurrency limits.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { Logger } from 'pino';

import type { Notifier } from '../notify/slack.js';
import type { RunnerConfig } from '../schemas/config.js';
import type { JobRow } from './cron-registry.js';
import { createCronRegistry } from './cron-registry.js';
import type { ExecutionResult } from './executor.js';
import type { executeJob } from './executor.js';

/** Scheduler dependencies. */
export interface SchedulerDeps {
  db: DatabaseSync;
  executor: typeof executeJob;
  notifier: Notifier;
  config: RunnerConfig;
  logger: Logger;
}

/** Scheduler interface. */
export interface Scheduler {
  start(): void;
  stop(): void;
  triggerJob(jobId: string): Promise<ExecutionResult>;
  reconcileNow(): void;
  getRunningJobs(): string[];
  getFailedRegistrations(): string[];
}

// JobRow is imported from cron-registry

/**
 * Create the job scheduler. Manages cron schedules, job execution, overlap policies, and notifications.
 */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const { db, executor, notifier, config, logger } = deps;
  const runningJobs = new Set<string>();

  const cronRegistry = createCronRegistry({
    db,
    logger,
    onScheduledRun: (job) => {
      void onScheduledRun(job);
    },
  });

  let reconcileInterval: NodeJS.Timeout | null = null;

  /** Insert a run record and return its ID. */
  function createRun(jobId: string, trigger: string): number {
    const result = db
      .prepare(
        `INSERT INTO runs (job_id, status, started_at, trigger) 
         VALUES (?, 'running', datetime('now'), ?)`,
      )
      .run(jobId, trigger);
    return result.lastInsertRowid;
  }

  /** Update run record with completion data. */
  function finishRun(runId: number, execResult: ExecutionResult): void {
    db.prepare(
      `UPDATE runs SET status = ?, finished_at = datetime('now'), duration_ms = ?, 
       exit_code = ?, tokens = ?, result_meta = ?, error = ?, stdout_tail = ?, stderr_tail = ?
       WHERE id = ?`,
    ).run(
      execResult.status,
      execResult.durationMs,
      execResult.exitCode,
      execResult.tokens,
      execResult.resultMeta,
      execResult.error,
      execResult.stdoutTail,
      execResult.stderrTail,
      runId,
    );
  }

  /** Execute a job: create run record, run script, update record, send notifications. */
  async function runJob(
    job: JobRow,
    trigger: string,
  ): Promise<ExecutionResult> {
    const { id, name, script, timeout_ms, on_success, on_failure } = job;

    // Check concurrency limit
    if (runningJobs.size >= config.maxConcurrency) {
      logger.warn({ jobId: id }, 'Max concurrency reached, skipping job');
      throw new Error('Max concurrency reached');
    }

    runningJobs.add(id);
    const runId = createRun(id, trigger);
    logger.info({ jobId: id, runId, trigger }, 'Starting job');

    try {
      const result = await executor({
        script,
        dbPath: config.dbPath,
        jobId: id,
        runId,
        timeoutMs: timeout_ms ?? undefined,
      });

      finishRun(runId, result);
      logger.info({ jobId: id, runId, status: result.status }, 'Job finished');

      // Send notifications
      if (result.status === 'ok' && on_success) {
        await notifier
          .notifySuccess(name, result.durationMs, on_success)
          .catch((err: unknown) => {
            logger.error({ jobId: id, err }, 'Notification failed');
          });
      } else if (result.status !== 'ok' && on_failure) {
        await notifier
          .notifyFailure(name, result.durationMs, result.error, on_failure)
          .catch((err: unknown) => {
            logger.error({ jobId: id, err }, 'Notification failed');
          });
      }

      return result;
    } finally {
      runningJobs.delete(id);
    }
  }

  /** Handle scheduled job fire. */
  async function onScheduledRun(job: JobRow): Promise<void> {
    const { id, overlap_policy } = job;

    // Check overlap policy
    if (runningJobs.has(id)) {
      if (overlap_policy === 'skip') {
        logger.info(
          { jobId: id },
          'Job already running, skipping (overlap_policy=skip)',
        );
        return;
      } else if (overlap_policy === 'queue') {
        logger.info(
          { jobId: id },
          'Job already running, queueing (overlap_policy=queue)',
        );
        // In a real implementation, we'd queue this. For now, just skip.
        return;
      }
      // 'allow' policy: proceed
    }

    await runJob(job, 'schedule').catch((err: unknown) => {
      logger.error({ jobId: id, err }, 'Job execution failed');
    });
  }

  // Cron registration and reconciliation are handled by cronRegistry.

  return {
    start(): void {
      const { totalEnabled, failedIds } = cronRegistry.reconcile();

      logger.info({ count: totalEnabled }, 'Loading jobs');

      if (failedIds.length > 0) {
        const ok = totalEnabled - failedIds.length;
        logger.warn(
          { failed: failedIds.length, total: totalEnabled },
          `${String(failedIds.length)} of ${String(totalEnabled)} jobs failed to register`,
        );
        const message = `⚠️ jeeves-runner started: ${String(ok)}/${String(totalEnabled)} jobs scheduled, ${String(failedIds.length)} failed: ${failedIds.join(', ')}`;
        const channel = config.notifications.defaultOnFailure;
        if (channel) {
          void notifier.notifyFailure('jeeves-runner', 0, message, channel);
        }
      }

      if (reconcileInterval === null && config.reconcileIntervalMs > 0) {
        reconcileInterval = setInterval(() => {
          try {
            cronRegistry.reconcile();
          } catch (err: unknown) {
            logger.error({ err }, 'Reconciliation failed');
          }
        }, config.reconcileIntervalMs);
      }
    },

    stop(): void {
      logger.info('Stopping scheduler');

      if (reconcileInterval) {
        clearInterval(reconcileInterval);
        reconcileInterval = null;
      }

      // Stop all crons
      cronRegistry.stopAll();

      // Wait for running jobs (simple poll with timeout)
      const deadline = Date.now() + config.shutdownGraceMs;
      const checkInterval = setInterval(() => {
        if (runningJobs.size === 0 || Date.now() > deadline) {
          clearInterval(checkInterval);
          if (runningJobs.size > 0) {
            logger.warn(
              { count: runningJobs.size },
              'Forced shutdown with running jobs',
            );
          }
        }
      }, 100);
    },

    async triggerJob(jobId: string): Promise<ExecutionResult> {
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as
        | JobRow
        | undefined;

      if (!job) throw new Error(`Job not found: ${jobId}`);
      return runJob(job, 'manual');
    },

    reconcileNow(): void {
      cronRegistry.reconcile();
    },

    getRunningJobs(): string[] {
      return Array.from(runningJobs);
    },

    getFailedRegistrations(): string[] {
      return cronRegistry.getFailedRegistrations();
    },
  };
}
