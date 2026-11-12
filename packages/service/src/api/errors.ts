/**
 * Every error the runner means a caller to see, as a jeeves `defineError` class (DD#96, #136): a `RUNNER_*` code, a caller-facing message and the status core's `RUNNER_ERROR_STATUS` gives it. jeeves' catalog scope (and `registerErrorHandlers`) sends them as Fastify's standard error body; anything else thrown is a masked 500 with no code. Pure.
 *
 * @module api/errors
 */

import { defineError } from '@karmaniverous/jeeves/fastify';

/** Longest caller-supplied `%s` argument a message carries (DD#96). */
export const MESSAGE_ARG_MAX = 300;

/**
 * Cap a caller-supplied `%s` argument at {@link MESSAGE_ARG_MAX} characters
 * (code points, so a surrogate pair is never split; an ellipsis marks a
 * cut). Pure.
 *
 * @param value - The argument.
 * @returns It, at most {@link MESSAGE_ARG_MAX} characters long.
 */
export function capArg(value: string): string {
  const chars = Array.from(value);
  return chars.length <= MESSAGE_ARG_MAX
    ? value
    : `${chars.slice(0, MESSAGE_ARG_MAX - 1).join('')}…`;
}

/** A schedule the schedule check rejects; the message is the check's. */
export const InvalidSchedule = defineError(
  'RUNNER_INVALID_SCHEDULE',
  '%s',
  400,
);

/** A `path` query jsonpath-plus can't evaluate; `%s` is its message. */
export const InvalidJsonPath = defineError(
  'RUNNER_INVALID_JSONPATH',
  'Invalid JSONPath: %s',
  400,
);

/** A pending queue item whose stored payload is not JSON. */
export const InvalidQueuePayload = defineError(
  'RUNNER_INVALID_QUEUE_PAYLOAD',
  'A pending item in this queue has a payload that is not JSON.',
  400,
);

/** No job with the id in the path; `%s` is the id. */
export const JobNotFound = defineError(
  'RUNNER_JOB_NOT_FOUND',
  'Job not found: %s',
  404,
);

/** `createJob` with an id a job already has; `%s` is the id. */
export const JobExists = defineError(
  'RUNNER_JOB_EXISTS',
  'Job already exists: %s',
  409,
);

/** A manual trigger refused at `maxConcurrency` (#118). */
export const MaxConcurrency = defineError(
  'RUNNER_MAX_CONCURRENCY',
  'Max concurrency reached; retry when a running job finishes.',
  409,
);

/**
 * Any other trigger failure. The message is fixed: the cause (pass it as
 * `{ cause }`) is logged, never sent.
 */
export const TriggerFailed = defineError(
  'RUNNER_TRIGGER_FAILED',
  'The job could not be run; the cause is in the runner log and on the run, if it started.',
  500,
);

/**
 * A {@link JobNotFound} for a caller-supplied id (capped).
 *
 * @param id - The job id from the path.
 * @returns The error to throw.
 */
export const jobNotFound = (id: string): Error => new JobNotFound(capArg(id));
