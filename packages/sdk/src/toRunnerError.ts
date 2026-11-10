/**
 * @module toRunnerError
 * The one mapping from what jeeves' catalog client throws to {@link RunnerError} (DD#80): a response keeps its HTTP status (`http_<status>`); client-side failures get the SDK's own codes and status 0. Pure.
 */

import { CatalogClientError } from '@karmaniverous/jeeves/catalog';

import { RunnerError } from './RunnerError.js';

/**
 * The SDK code of a failure that produced no usable response.
 *
 * @param cause - The underlying error.
 * @returns `timeout`, `invalid_response` (a 2xx body that is not JSON) or `network_error`.
 */
function noResponseCode(
  cause: unknown,
): 'timeout' | 'invalid_response' | 'network_error' {
  if (cause instanceof Error && cause.name === 'TimeoutError') return 'timeout';
  if (cause instanceof SyntaxError) return 'invalid_response';
  return 'network_error';
}

/**
 * Message of an underlying error.
 *
 * @param cause - Anything thrown.
 * @returns Its message, or its string form.
 */
const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Convert a failed catalog call to a {@link RunnerError}.
 *
 * @param error - What the catalog client threw.
 * @param operation - Catalog entry name (used in messages).
 * @param timeoutMs - The call's timeout (used in the timeout message).
 * @param responseText - The non-2xx body as received, when captured.
 * @returns The error to throw.
 */
export function toRunnerError(
  error: unknown,
  operation: string,
  timeoutMs: number,
  responseText?: string,
): RunnerError {
  if (!(error instanceof CatalogClientError)) {
    return new RunnerError({
      code: 'network_error',
      status: 0,
      message: `${operation} request failed: ${messageOf(error)}`,
      cause: error,
    });
  }
  if (error.status >= 300) {
    return new RunnerError({
      code: `http_${String(error.status)}` as `http_${number}`,
      status: error.status,
      message: `${operation} failed (HTTP ${String(error.status)}): ${error.body?.error ?? 'no error message'}`,
      ...(error.body === undefined ? {} : { body: error.body }),
      ...(responseText === undefined ? {} : { responseText }),
      cause: error,
    });
  }
  if (error.issues !== undefined) {
    const responded = error.status > 0;
    return new RunnerError({
      code: responded ? 'invalid_response' : 'invalid_request',
      status: error.status,
      message: responded
        ? `${operation} response did not match the expected shape`
        : error.message,
      issues: error.issues,
      cause: error,
    });
  }
  const code = noResponseCode(error.cause);
  const message =
    code === 'timeout'
      ? `${operation} timed out after ${String(timeoutMs)} ms`
      : code === 'invalid_response'
        ? `${operation} returned a response that is not JSON`
        : `${operation} request failed: ${messageOf(error.cause)}`;
  return new RunnerError({
    code,
    // A non-JSON 2xx did arrive: keep its status.
    status: code === 'invalid_response' ? error.status : 0,
    message,
    cause: error,
  });
}
