/**
 * @module RunnerError
 * The single error class thrown by the SDK: client-side validation, timeouts, network failures, non-2xx responses and unparseable responses. Pure.
 */

import type { ErrorBody } from '@karmaniverous/jeeves/catalog';

/**
 * Codes the SDK assigns itself (lower case, so they never collide with a
 * server code). An error from a non-2xx response carries the server's code
 * instead: the body's `code` (a `RunnerErrorCode` from core
 * `RUNNER_ERROR_CODES`, a jeeves `JEEVES_*` code or a Fastify `FST_ERR_*`
 * code), else `http_<status>` (a masked 500, an unknown route, a body that
 * isn't Fastify's).
 *
 * - `invalid_options`: {@link createRunnerClient} options are invalid.
 * - `invalid_request`: the input failed the catalog entry's request schema; nothing was sent.
 * - `invalid_response`: a 2xx response was not JSON or failed the entry's response schema.
 * - `timeout`: no response within the call's timeout.
 * - `network_error`: `fetch` rejected (connection refused, DNS failure, ...).
 */
export type RunnerClientErrorCode =
  | 'invalid_options'
  | 'invalid_request'
  | 'invalid_response'
  | 'timeout'
  | 'network_error';

/** Constructor fields of a {@link RunnerError}. */
export interface RunnerErrorInit {
  /** The server's code, `http_<status>` or a {@link RunnerClientErrorCode}. */
  code: string;
  /** Human-readable message (a response's: the body's `message`). */
  message: string;
  /** HTTP status when a response arrived, else 0. */
  status: number;
  /** Parsed error body of a non-2xx response. */
  body?: ErrorBody;
  /** The non-2xx response body exactly as received. */
  responseText?: string;
  /** Zod issues of an `invalid_request` or `invalid_response`. */
  issues?: unknown;
  /** Underlying error, if any. */
  cause?: unknown;
}

/**
 * The one error type thrown by every SDK call. The SDK never retries;
 * branch on `code` (`triggerJob`: `RUNNER_JOB_NOT_FOUND`,
 * `RUNNER_MAX_CONCURRENCY`, `RUNNER_TRIGGER_FAILED`), never on `message`;
 * `status` is the HTTP status.
 */
export class RunnerError extends Error {
  /**
   * Machine-readable code: the response body's `code` (`RUNNER_*`,
   * `JEEVES_*`, `FST_ERR_*`), else `http_<status>`, or a
   * {@link RunnerClientErrorCode} when no usable response arrived.
   */
  readonly code: string;
  /** HTTP status when a response arrived, else 0. */
  readonly status: number;
  /**
   * Parsed error body of a non-2xx response: Fastify's standard body
   * `{ statusCode, code?, error, message }`.
   */
  readonly body?: ErrorBody;
  /** The non-2xx response body exactly as received (JSON or not). */
  readonly responseText?: string;
  /** Zod issues of an `invalid_request` or `invalid_response`. */
  readonly issues?: unknown;

  /**
   * Create a runner error.
   *
   * @param init - Code, message, status and optional body, text, issues and cause.
   */
  constructor(init: RunnerErrorInit) {
    super(init.message, init.cause === undefined ? {} : { cause: init.cause });
    this.name = 'RunnerError';
    this.code = init.code;
    this.status = init.status;
    this.body = init.body;
    this.responseText = init.responseText;
    this.issues = init.issues;
  }
}

/**
 * The body of a non-2xx response as text: exactly as received when it was
 * captured, else the parsed body as JSON (`{}` when there is none).
 *
 * @param error - A RunnerError with an HTTP status.
 * @returns The body text.
 */
export function errorBodyText(error: RunnerError): string {
  return error.responseText ?? JSON.stringify(error.body ?? {});
}

/**
 * Type guard for {@link RunnerError}.
 *
 * @param value - Any value (typically a caught error).
 * @returns `true` when `value` is a {@link RunnerError}.
 */
export function isRunnerError(value: unknown): value is RunnerError {
  return value instanceof RunnerError;
}
