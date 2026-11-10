/**
 * @module RunnerError.test
 * The SDK error: fields kept from its init, and the type guard.
 */

import { describe, expect, it } from 'vitest';

import { errorBodyText, isRunnerError, RunnerError } from './RunnerError.js';

describe('RunnerError', () => {
  it('keeps code, status, body, text, issues and cause', () => {
    const cause = new Error('inner');
    const err = new RunnerError({
      code: 'http_409',
      status: 409,
      message: 'busy',
      body: { error: 'Max concurrency reached' },
      responseText: '{"error":"Max concurrency reached"}',
      issues: [],
      cause,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: 'RunnerError',
      code: 'http_409',
      status: 409,
      message: 'busy',
      body: { error: 'Max concurrency reached' },
      responseText: '{"error":"Max concurrency reached"}',
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
    expect(errorBodyText(http({ responseText: '', body: { error: '' } }))).toBe(
      '',
    );
  });

  it('falls back to the parsed body, or {}', () => {
    expect(errorBodyText(http({ body: { error: 'e' } }))).toBe('{"error":"e"}');
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
