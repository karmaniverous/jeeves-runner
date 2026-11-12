/**
 * `withJsonPath` (DD#96): no path returns the body, a valid path the `{ result, count }` wrap, and anything jsonpath-plus throws becomes `RUNNER_INVALID_JSONPATH` with its message (an `Error`'s message, else the thrown value's string form), capped.
 */

import { runInNewContext } from 'node:vm';

import type * as JsonPathPlus from 'jsonpath-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const jsonPathMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock('jsonpath-plus', async (importOriginal) => {
  const real = await importOriginal<typeof JsonPathPlus>();
  return {
    ...real,
    JSONPath: (...args: Parameters<typeof real.JSONPath>): unknown => {
      const impl = jsonPathMock.getMockImplementation();
      return impl ? impl(...args) : real.JSONPath(...args);
    },
  };
});

import { InvalidJsonPath, MESSAGE_ARG_MAX } from './errors.js';
import { withJsonPath } from './handler-utils.js';

beforeEach(() => {
  jsonPathMock.mockReset();
});

describe('withJsonPath', () => {
  const body = { a: 1, b: [2, 3] };

  it('returns the body without a path', () => {
    expect(withJsonPath(body, undefined)).toBe(body);
  });

  it('wraps a JSONPath result', () => {
    expect(withJsonPath(body, '$.b[*]')).toEqual({ result: [2, 3], count: 2 });
  });

  it('turns a parser Error into RUNNER_INVALID_JSONPATH with its message', () => {
    const thrown = (() => {
      try {
        withJsonPath(body, '$[(((');
      } catch (err) {
        return err;
      }
    })();
    expect(thrown).toBeInstanceOf(InvalidJsonPath);
    expect(thrown).toMatchObject({
      code: 'RUNNER_INVALID_JSONPATH',
      statusCode: 400,
      message: 'Invalid JSONPath: Unclosed ( at character 3',
    });
  });

  it('uses the string form of an error from another realm (not instanceof Error), capped', () => {
    const foreign: unknown = runInNewContext(
      `new Error('${'x'.repeat(MESSAGE_ARG_MAX)}')`,
    );
    expect(foreign instanceof Error).toBe(false);
    jsonPathMock.mockImplementation(() => {
      throw foreign;
    });
    expect(() => withJsonPath(body, '$.a')).toThrow(
      `Invalid JSONPath: Error: ${'x'.repeat(MESSAGE_ARG_MAX - 8)}…`,
    );
  });
});
