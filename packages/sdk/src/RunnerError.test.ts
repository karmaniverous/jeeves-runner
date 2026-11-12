/**
 * @module RunnerError.test
 * The SDK error: fields kept from its init, and the type guard.
 */

import { describe, expect, it } from 'vitest';

import { errorBodyText, isRunnerError, RunnerError } from './RunnerError.js';

describe('RunnerError', () => {
  it('keeps code, status, body, text, issues and cause', () => {
    const cause = new Error('inner');
    const body = {
      statusCode: 409,
      code: 'RUNNER_MAX_CONCURRENCY',
      error: 'Conflict',
      message: 'busy',
    };
    const err = new RunnerError({
      code: 'RUNNER_MAX_CONCURRENCY',
      status: 409,
      message: 'busy',
      body,
      responseText: JSON.stringify(body),
      issues: [],
      cause,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: 'RunnerError',
      code: 'RUNNER_MAX_CONCURRENCY',
      status: 409,
      message: 'busy',
      body,
      responseText: JSON.stringify(body),
      issues: [],
    });
    expect(err.cause).toBe(cause);
  });

  it('has no cause unless given one', () => {
    const err = new RunnerError({ code: 'timeout', status: 0, message: 't' });
    expect('cause' in err).toBe(false);
  });
});

describe('errorBodyText', () => {
  const http = (extra: object) =>
    new RunnerError({ code: 'http_502', status: 502, message: 'x', ...extra });

  it('is the body as received when captured, even empty', () => {
    expect(errorBodyText(http({ responseText: 'Bad Gateway' }))).toBe(
      'Bad Gateway',
    );
    const body = { statusCode: 502, error: 'Bad Gateway', message: '' };
    expect(errorBodyText(http({ responseText: '', body }))).toBe('');
  });

  it('falls back to the parsed body, or {}', () => {
    const body = { statusCode: 502, error: 'Bad Gateway', message: 'e' };
    expect(errorBodyText(http({ body }))).toBe(JSON.stringify(body));
    expect(errorBodyText(http({}))).toBe('{}');
  });
});

describe('isRunnerError', () => {
  it('tells a RunnerError from other errors and values', () => {
    expect(
      isRunnerError(
        new RunnerError({ code: 'timeout', status: 0, message: 't' }),
      ),
    ).toBe(true);
    expect(isRunnerError(new Error('x'))).toBe(false);
    expect(isRunnerError({ code: 'timeout', status: 0 })).toBe(false);
  });
});
