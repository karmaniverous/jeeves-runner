/**
 * The client's half of the runner error contract (DD#96, #136): every `RUNNER_*` code a runner error body can carry (`RUNNER_ERROR_CODES`) and the HTTP status each is sent with (`RUNNER_ERROR_STATUS`). The body itself is Fastify's standard error body (`errorBodySchema` from `@karmaniverous/jeeves/catalog`). Pure data.
 *
 * @module errors
 */

/**
 * Every `RUNNER_*` code a non-2xx runner response can carry, in one list.
 * The body is Fastify's standard error body,
 * `{ statusCode, code?, error, message }`; other codes come from jeeves
 * (`JEEVES_*`) and Fastify (`FST_ERR_*`), and an unexpected failure is a
 * 500 with no `code` at all. Codes are stable in meaning; the status of
 * each is in {@link RUNNER_ERROR_STATUS}.
 *
 * - `RUNNER_INVALID_SCHEDULE` (400): `createJob` or `updateJob` with a
 *   schedule that is neither a valid cron expression nor a valid RRStack.
 * - `RUNNER_INVALID_JSONPATH` (400): the `path` query of `queryState` or
 *   `queryCollection` is not a valid JSONPath expression.
 * - `RUNNER_INVALID_QUEUE_PAYLOAD` (400): `queuePeek` reached a pending
 *   item whose stored payload is not JSON.
 * - `RUNNER_JOB_NOT_FOUND` (404): no job has the id in the path.
 * - `RUNNER_JOB_EXISTS` (409): `createJob` with an id a job already has.
 * - `RUNNER_MAX_CONCURRENCY` (409): a manual trigger refused because
 *   `maxConcurrency` jobs are running; not recorded as a run (#118).
 * - `RUNNER_TRIGGER_FAILED` (500): a manual trigger failed for any other
 *   reason; the cause is in the runner log, and on the run row when the
 *   run had started.
 */
export const RUNNER_ERROR_CODES = [
  'RUNNER_INVALID_SCHEDULE',
  'RUNNER_INVALID_JSONPATH',
  'RUNNER_INVALID_QUEUE_PAYLOAD',
  'RUNNER_JOB_NOT_FOUND',
  'RUNNER_JOB_EXISTS',
  'RUNNER_MAX_CONCURRENCY',
  'RUNNER_TRIGGER_FAILED',
] as const;

/** A `RUNNER_*` error code. */
export type RunnerErrorCode = (typeof RUNNER_ERROR_CODES)[number];

/** The HTTP status each `RUNNER_*` code is sent with (one per code). */
export const RUNNER_ERROR_STATUS: Readonly<Record<RunnerErrorCode, number>> = {
  RUNNER_INVALID_SCHEDULE: 400,
  RUNNER_INVALID_JSONPATH: 400,
  RUNNER_INVALID_QUEUE_PAYLOAD: 400,
  RUNNER_JOB_NOT_FOUND: 404,
  RUNNER_JOB_EXISTS: 409,
  RUNNER_MAX_CONCURRENCY: 409,
  RUNNER_TRIGGER_FAILED: 500,
};
