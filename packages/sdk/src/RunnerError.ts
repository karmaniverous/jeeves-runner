/**
 * @module RunnerError
 * The single error class thrown by the SDK: client-side validation, timeouts, network failures, non-2xx responses and unparseable responses. Pure.
 */

import type { ErrorBody } from '@karmaniverous/jeeves/catalog';

/**
 * Codes the SDK assigns. A non-2xx response gets `http_<status>`
 * (`http_404`, `http_409`, `http_500`, ...).
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
  /** `http_<status>` or a {@link RunnerClientErrorCode}. */
  code: `http_${number}` | RunnerClientErrorCode;
  /** Human-readable message. */
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
 * branch on `status` (`triggerJob`: 404 unknown job, 409 at
 * `maxConcurrency`, 500 other failure) or `code`.
 */
export class RunnerError extends Error {
  /** `http_<status>` or a {@link RunnerClientErrorCode}. */
  readonly code: RunnerErrorInit['code'];
  /** HTTP status when a response arrived, else 0. */
  readonly status: number;
  /** Parsed error body of a non-2xx response (`{ error, ... }`). */
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
 * Type guard for {@link RunnerError}.
 *
 * @param value - Any value (typically a caught error).
 * @returns `true` when `value` is a {@link RunnerError}.
 */
export function isRunnerError(value: unknown): value is RunnerError {
  return value instanceof RunnerError;
}
