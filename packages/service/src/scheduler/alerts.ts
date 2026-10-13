/**
 * Notification channel resolution and fire-and-forget failure alerts for
 * the scheduler.
 *
 * @module
 */

import type { Logger } from 'pino';

import type { Notifier } from '../notify/slack.js';
import type { RunnerConfig } from '../schemas/config.js';
import type { JobRow } from './cron-registry.js';

/** Scheduler alert helpers. */
export interface SchedulerAlerts {
  /**
   * A job's channels: its own `on_success`/`on_failure`, falling back to
   * `notifications.defaultOnSuccess`/`defaultOnFailure` (DD#77).
   */
  resolveChannels: (job: JobRow) => {
    onSuccess: string | null;
    onFailure: string | null;
  };
  /** Send a failure alert without awaiting it; log, never throw, on error. */
  alertFailure: (name: string, message: string, channel: string) => void;
}

/** Create the scheduler's alert helpers. */
export function createSchedulerAlerts(deps: {
  notifier: Notifier;
  config: RunnerConfig;
  logger: Pick<Logger, 'error'>;
}): SchedulerAlerts {
  const { notifier, config, logger } = deps;
  return {
    resolveChannels: (job) => ({
      onSuccess: job.on_success ?? config.notifications.defaultOnSuccess,
      onFailure: job.on_failure ?? config.notifications.defaultOnFailure,
    }),
    alertFailure: (name, message, channel) => {
      notifier
        .notifyFailure(name, 0, message, channel)
        .catch((err: unknown) => {
          logger.error({ jobName: name, err }, 'Failure notification failed');
        });
    },
  };
}
