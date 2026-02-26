/**
 * Notification dispatch helper for job completion events.
 */

import type { Logger } from 'pino';

import type { Notifier } from '../notify/slack.js';
import type { ExecutionResult } from './executor.js';

/** Dispatch notification based on execution result and job configuration. */
export async function dispatchNotification(
  result: ExecutionResult,
  jobName: string,
  onSuccess: string | null,
  onFailure: string | null,
  notifier: Notifier,
  logger: Logger,
): Promise<void> {
  if (result.status === 'ok' && onSuccess) {
    await notifier
      .notifySuccess(jobName, result.durationMs, onSuccess)
      .catch((err: unknown) => {
        logger.error({ jobName, err }, 'Success notification failed');
      });
  } else if (result.status !== 'ok' && onFailure) {
    await notifier
      .notifyFailure(jobName, result.durationMs, result.error, onFailure)
      .catch((err: unknown) => {
        logger.error({ jobName, err }, 'Failure notification failed');
      });
  }
}
