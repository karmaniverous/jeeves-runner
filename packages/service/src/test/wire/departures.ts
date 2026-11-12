/**
 * @module test/wire/departures
 * The closed list of approved wire departures from the 0.14.0-0 baseline (DD#87, extended by DD#96 for #136): each departing scenario, what 0.14.0-0 answered, and the DD#87 item that allows the change, with the code the new body must carry. Pure data.
 */

/**
 * The DD#87 item a departure falls under.
 *
 * - `a`: the request fails a catalog schema; Fastify's 400 `FST_ERR_VALIDATION`.
 * - `a-reread`: a `limit` `parseInt` misread, now read as a number (still 200).
 * - `d`: an error with the same status, now Fastify's standard body with a code.
 * - `e`: a duplicate job id: 409 `RUNNER_JOB_EXISTS` instead of the SQLite 500.
 * - `f`: any other trigger failure: 500 `RUNNER_TRIGGER_FAILED`, fixed message.
 * - `g`: a non-JSON queue payload or a bad JSONPath: a 400 instead of a 500.
 */
export type DepartureItem = 'a' | 'a-reread' | 'd' | 'e' | 'f' | 'g';

/** One approved departure. */
export interface WireDeparture {
  /** What 0.14.0-0 answered, and why. */
  before: string;
  /** The DD#87 item that allows it. */
  item: DepartureItem;
  /** The `code` the new body carries (every item but `a-reread`). */
  code?: string;
  /**
   * Item `a`: the start of Fastify's validation message, naming the slot
   * and field of the first failure (`body/name`, `querystring/limit`).
   */
  field?: string;
}

/** A request failing a catalog schema (item a). */
const invalid = (before: string, field: string): WireDeparture => ({
  before,
  item: 'a',
  code: 'FST_ERR_VALIDATION',
  field,
});

/** A route's own `{ error: <ZodError message> }` 400 (item a). */
const zodError = (field: string): WireDeparture =>
  invalid(
    "400 { error: <ZodError message> } from the route's own parse",
    field,
  );

/** `limit` read by `parseInt`, so malformed values failed in SQLite or were truncated. */
const limit = (before: string): WireDeparture =>
  invalid(before, 'querystring/limit');

/** A `limit` now read as a different number, still 200 (item a). */
const reread = (before: string): WireDeparture => ({
  before,
  item: 'a-reread',
});

/** Same status, Fastify's standard body with a code (item d). */
const reshaped = (before: string, code: string): WireDeparture => ({
  before,
  item: 'd',
  code,
});

/** The `{ error: 'Job not found' }` 404 (item d). */
const notFound = reshaped(
  "404 { error: 'Job not found' }",
  'RUNNER_JOB_NOT_FOUND',
);

/** A schedule check's `{ error: <message> }` 400 (item d). */
const badSchedule = reshaped(
  '400 { error: <schedule check message> }',
  'RUNNER_INVALID_SCHEDULE',
);

/** Approved departures by scenario name (DD#87 items a, d-g). */
export const WIRE_DEPARTURES: Readonly<Partial<Record<string, WireDeparture>>> =
  {
    // Item a: catalog schema failures.
    'configApply empty body': invalid(
      '500: the handler read Object.keys(undefined)',
      'body/patch',
    ),
    'configApply non-object patch': invalid(
      '200: an array patch was merged as an object',
      'body/patch',
    ),
    'configApply no body': invalid(
      '500: the route read request.body.patch',
      'body/ ',
    ),
    'createJob invalid body': zodError('body/name'),
    'createJob no body': zodError('body/ '),
    'updateJob invalid body': zodError('body/name'),
    'updateJob invalid body not found': invalid(
      '400 (validation before the 404), ZodError message',
      'body/name',
    ),
    'updateJob no body': zodError('body/ '),
    'updateScript invalid body': zodError('body/script'),
    'updateScript bad source_type': zodError('body/source_type'),
    'jobRuns limit negative': limit('200: LIMIT -1 returned every run'),
    'jobRuns limit not a number': limit(
      '500: LIMIT NaN, SQLite datatype mismatch',
    ),
    'jobRuns limit fraction': limit('200: parseInt read 1.5 as 1'),
    'jobRuns limit trailing text': limit('200: parseInt read 1abc as 1'),
    'jobRuns repeated limit': limit('200: parseInt read [1, 2] as 1'),
    'jobRuns limit empty': limit('500: LIMIT NaN, SQLite datatype mismatch'),
    'jobRuns limit zero': limit('200: LIMIT 0 returned no runs'),
    'queuePeek limit not a number': limit(
      '500: LIMIT NaN, SQLite datatype mismatch',
    ),
    'queuePeek limit empty': limit('500: LIMIT NaN, SQLite datatype mismatch'),
    'queuePeek limit zero': limit('200: LIMIT 0 returned no items'),
    'queryCollection limit not a number': limit(
      '500: LIMIT NaN, SQLite datatype mismatch',
    ),
    'queryCollection limit zero': limit('200: LIMIT 0 returned no items'),
    'queryCollection limit negative': limit(
      '200: LIMIT -1 returned every item',
    ),
    'queryCollection order other': invalid(
      '200: any order other than asc read as desc',
      'querystring/order',
    ),
    'queuePeek limit hex': reread(
      '200: parseInt read 0x1 as 0 (no items); now read as 1',
    ),
    'jobRuns limit exponent': reread(
      '200: parseInt read 1e1 as 1 (one run); now read as 10',
    ),

    // Item d: same status, standard body with a code.
    'config invalid jsonpath': reshaped(
      '400 { error: <jsonpath-plus message> } from jeeves 0.7',
      'JEEVES_CONFIG_QUERY_INVALID',
    ),
    'configApply invalid config': reshaped(
      "400 { error: 'Config validation failed', issues } from jeeves 0.7",
      'JEEVES_CONFIG_INVALID',
    ),
    'createJob bad schedule': badSchedule,
    'updateJob bad schedule': badSchedule,
    'jobDetail not found': notFound,
    'jobDetail encoded id': notFound,
    'updateJob not found': notFound,
    'deleteJob not found': notFound,
    'enableJob not found': notFound,
    'disableJob not found': notFound,
    'updateScript not found': notFound,
    'triggerJob not found': reshaped(
      "404 { error: 'Job not found: nope' }",
      'RUNNER_JOB_NOT_FOUND',
    ),
    'triggerJob at maxConcurrency': reshaped(
      "409 { error: 'Max concurrency reached' }",
      'RUNNER_MAX_CONCURRENCY',
    ),

    // Item e: duplicate id.
    'createJob duplicate id': {
      before:
        "500 { statusCode, code: 'ERR_SQLITE_ERROR', error, message: 'UNIQUE constraint failed: jobs.id' }",
      item: 'e',
      code: 'RUNNER_JOB_EXISTS',
    },

    // Item f: other trigger failures, masked behind a fixed message.
    'triggerJob other error': {
      before: "500 { error: 'database is locked' } (the error's own text)",
      item: 'f',
      code: 'RUNNER_TRIGGER_FAILED',
    },
    'triggerJob non-Error rejection': {
      before: "500 { error: 'Unknown error' }",
      item: 'f',
      code: 'RUNNER_TRIGGER_FAILED',
    },

    // Item g: library errors a caller should see.
    'queuePeek non-JSON payload': {
      before: "500 { statusCode, error, message: <JSON.parse's text> }",
      item: 'g',
      code: 'RUNNER_INVALID_QUEUE_PAYLOAD',
    },
    'queryState invalid jsonpath': {
      before: "500 { statusCode, error, message: <jsonpath-plus's text> }",
      item: 'g',
      code: 'RUNNER_INVALID_JSONPATH',
    },
  };
