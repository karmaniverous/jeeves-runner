/**
 * The app's error handler: answers a thrown error exactly as Fastify's default handler did in 0.14.0-0 (`{ statusCode, code?, error, message }`), byte for byte (DD#87).
 *
 * @remarks
 * Needed because jeeves' catalog routes declare a `5xx` response schema:
 * Fastify's fallback handler then serializes a thrown error through that
 * schema instead of its own, sending the error's enumerable fields in place
 * of `statusCode` and `message`. The catalog scope rethrows every error that
 * is not a request-validation or response-mismatch error to this handler,
 * with a serializer that passes strings through, so the body is sent as
 * built here. Logging follows Fastify's default (5xx at `error`, others at
 * `info`).
 *
 * @module api/error-handler
 */

import { STATUS_CODES } from 'node:http';

import type { FastifyReply, FastifyRequest } from 'fastify';

/** What a route may throw: any error, maybe with a code and a status. */
type ThrownError = Error & {
  code?: string | number;
  statusCode?: number;
  status?: number;
};

/**
 * Status code for an error, as Fastify's default handler picks it.
 *
 * @param error - The thrown error.
 * @returns `statusCode` (or `status`) when it is 400 or more, else 500.
 */
function statusOf(error: ThrownError): number {
  const status = error.statusCode ?? error.status ?? 0;
  return status >= 400 ? status : 500;
}

/**
 * Answer a thrown error with Fastify's default body.
 *
 * @param error - The thrown error.
 * @param request - The request.
 * @param reply - The reply.
 * @returns The sent reply.
 */
export function fastifyDefaultErrorHandler(
  error: ThrownError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const statusCode = statusOf(error);
  if (statusCode >= 500)
    request.log.error({ req: request, res: reply, err: error }, error.message);
  else request.log.info({ res: reply, err: error }, error.message);

  const body = {
    statusCode,
    ...(error.code === undefined ? {} : { code: String(error.code) }),
    error: STATUS_CODES[statusCode] ?? 'Unknown Error',
    message: error.message,
  };
  return reply
    .code(statusCode)
    .type('application/json; charset=utf-8')
    .send(JSON.stringify(body));
}
