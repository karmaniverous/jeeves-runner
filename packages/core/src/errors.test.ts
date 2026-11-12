/**
 * The runner error table (DD#96): one status per code, every code upper case with the `RUNNER_` prefix, every status an HTTP error status, and the exports reachable from the package root.
 */

import { describe, expect, it } from 'vitest';

import { RUNNER_ERROR_CODES, RUNNER_ERROR_STATUS } from './errors.js';
import * as root from './index.js';

describe('RUNNER_ERROR_STATUS', () => {
  it('has exactly one entry per code, in the list order', () => {
    expect(Object.keys(RUNNER_ERROR_STATUS)).toEqual([...RUNNER_ERROR_CODES]);
  });

  it('names codes in upper case with the RUNNER_ prefix, without duplicates', () => {
    for (const code of RUNNER_ERROR_CODES)
      expect(code).toMatch(/^RUNNER_[A-Z_]+$/);
    expect(new Set(RUNNER_ERROR_CODES).size).toBe(RUNNER_ERROR_CODES.length);
  });

  it('gives the agreed statuses (DD#96)', () => {
    expect(RUNNER_ERROR_STATUS).toEqual({
      RUNNER_INVALID_SCHEDULE: 400,
      RUNNER_INVALID_JSONPATH: 400,
      RUNNER_INVALID_QUEUE_PAYLOAD: 400,
      RUNNER_JOB_NOT_FOUND: 404,
      RUNNER_JOB_EXISTS: 409,
      RUNNER_MAX_CONCURRENCY: 409,
      RUNNER_TRIGGER_FAILED: 500,
    });
  });

  it('is exported from the package root', () => {
    expect(root.RUNNER_ERROR_STATUS).toBe(RUNNER_ERROR_STATUS);
    expect(root.RUNNER_ERROR_CODES).toBe(RUNNER_ERROR_CODES);
  });
});
