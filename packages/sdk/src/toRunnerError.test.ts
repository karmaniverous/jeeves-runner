/**
 * @module toRunnerError.test
 * Error mapping (DD#80, DD#96): responses keep their HTTP status, their body's code (else `http_<status>`) and message, and the body; client-side failures get the SDK codes with status 0.
 */

import { CatalogClientError } from '@karmaniverous/jeeves/catalog';
import { describe, expect, it } from 'vitest';

import { RunnerError } from './RunnerError.js';
import { toRunnerError } from './toRunnerError.js';

type Details = ConstructorParameters<typeof CatalogClientError>[1];

/** A catalog client error; `issues` loosely typed for brevity. */
const clientError = ({
  message,
  issues,
  ...details
}: Omit<Details, 'issues'> & { message: string; issues?: unknown[] }) =>
  new CatalogClientError(message, {
    ...details,
    ...(issues === undefined ? {} : { issues: issues as Details['issues'] }),
  });

describe('toRunnerError', () => {
  it.each([
    [404, 'RUNNER_JOB_NOT_FOUND', 'Not Found', 'Job not found: j'],
    [
      409,
      'RUNNER_MAX_CONCURRENCY',
      'Conflict',
      'Max concurrency reached; retry when a running job finishes.',
    ],
    [
      500,
      'RUNNER_TRIGGER_FAILED',
      'Internal Server Error',
      'The job could not be run; the cause is in the runner log and on the run, if it started.',
    ],
  ])(
    "keeps HTTP %i, the body's code %s and its message",
    (status, code, error, message) => {
      const body = { statusCode: status, code, error, message };
      const err = toRunnerError(
        clientError({ message: 'x', status, body }),
        'triggerJob',
        1000,
        JSON.stringify(body),
      );
      expect(err).toBeInstanceOf(RunnerError);
      expect(err).toMatchObject({
        code,
        status,
        body,
        responseText: JSON.stringify(body),
        message,
      });
    },
  );

  it('falls back to http_<status> for a body without a code (a masked 500)', () => {
    const body = {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'The server could not complete the request.',
    };
    const err = toRunnerError(
      clientError({ message: 'x', status: 500, body }),
      'listJobs',
      1000,
    );
    expect(err).toMatchObject({
      code: 'http_500',
      status: 500,
      message: 'The server could not complete the request.',
    });
  });

  it('treats an empty code and message as absent, falling back to the status text', () => {
    const err = toRunnerError(
      clientError({
        message: 'x',
        status: 418,
        body: { statusCode: 418, code: '', error: 'Teapot', message: '' },
      }),
      'status',
      1000,
    );
    expect(err).toMatchObject({ code: 'http_418', message: 'Teapot' });
  });

  it('names a non-2xx without a body', () => {
    const err = toRunnerError(
      clientError({ message: 'x', status: 502 }),
      'status',
      1000,
    );
    expect(err).toMatchObject({ code: 'http_502', status: 502 });
    expect(err.message).toBe('HTTP 502');
    expect(err).not.toHaveProperty('responseText', expect.anything());
  });

  it('maps request-schema issues (nothing sent) to invalid_request', () => {
    const err = toRunnerError(
      clientError({
        message: 'Invalid input for "createJob"',
        status: 0,
        issues: [{ path: ['name'] }],
      }),
      'createJob',
      1000,
    );
    expect(err).toMatchObject({
      code: 'invalid_request',
      status: 0,
      issues: [{ path: ['name'] }],
      message: 'Invalid input for "createJob"',
    });
  });

  it('maps response-schema issues to invalid_response with the status', () => {
    const err = toRunnerError(
      clientError({ message: 'x', status: 200, issues: [] }),
      'listJobs',
      1000,
    );
    expect(err).toMatchObject({ code: 'invalid_response', status: 200 });
  });

  it('maps an aborted call to timeout, naming the timeout', () => {
    const cause = new DOMException('aborted', 'TimeoutError');
    const err = toRunnerError(
      clientError({ message: 'x', status: 0, cause }),
      'triggerJob',
      1_800_000,
    );
    expect(err).toMatchObject({ code: 'timeout', status: 0 });
    expect(err.message).toBe('triggerJob timed out after 1800000 ms');
  });

  it('maps a non-JSON 2xx to invalid_response', () => {
    const err = toRunnerError(
      clientError({
        message: 'x',
        status: 200,
        cause: new SyntaxError('Unexpected token'),
      }),
      'status',
      1000,
    );
    expect(err).toMatchObject({ code: 'invalid_response', status: 200 });
  });

  it('maps a fetch failure to network_error, keeping the cause', () => {
    const cause = new TypeError('fetch failed');
    const wrapped = clientError({ message: 'x', status: 0, cause });
    const err = toRunnerError(wrapped, 'status', 1000);
    expect(err).toMatchObject({ code: 'network_error', status: 0 });
    expect(err.message).toBe('status request failed: fetch failed');
    expect(err.cause).toBe(wrapped);
  });

  it('maps anything else thrown to network_error', () => {
    const err = toRunnerError('boom', 'status', 1000);
    expect(err).toMatchObject({
      code: 'network_error',
      status: 0,
      message: 'status request failed: boom',
    });
  });
});
