/**
 * A run whose execution throws (instead of returning a result) is finished as an `error` run with the thrown message, so a manual trigger answered `RUNNER_TRIGGER_FAILED` (DD#96) leaves its cause on the run; the throw still reaches the caller, the slot is freed, and (as before) no alert is sent. A failure to record the run never hides the original error.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb, type TestDb } from '../test-utils/db.js';
import {
  createSchedulerMocks,
  createTestScheduler,
} from '../test-utils/scheduler.js';
import { thrownResult } from './scheduler.js';

let testDb: TestDb;

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.cleanup();
});

/** Insert one enabled job. */
const addJob = (id: string, type: 'script' | 'session') =>
  testDb.db
    .prepare(
      'INSERT INTO jobs (id, name, schedule, script, type) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, id, '0 0 * * *', 'x', type);

/** Every run of a job, oldest first. */
const runsOf = (id: string) =>
  testDb.db
    .prepare(
      'SELECT status, error, exit_code, finished_at IS NOT NULL AS finished FROM runs WHERE job_id = ? ORDER BY id',
    )
    .all(id);

describe('a run whose execution throws', () => {
  it('is recorded as an error run with the message: a session job without a gateway client', async () => {
    addJob('s', 'session');
    const mocks = createSchedulerMocks();
    const scheduler = createTestScheduler(testDb.db, mocks);

    await expect(scheduler.triggerJob('s')).rejects.toThrow(
      'Session job requires Gateway client',
    );
    expect(runsOf('s')).toEqual([
      {
        status: 'error',
        error:
          'Session job requires Gateway client (gatewayUrl/gatewayApiKey not configured)',
        exit_code: null,
        finished: 1,
      },
    ]);
    expect(scheduler.getRunningJobs()).toEqual([]);
    expect(mocks.dispatchResultMock).not.toHaveBeenCalled();
  });

  it('is recorded as an error run with the message: an executor that rejects', async () => {
    addJob('j', 'script');
    const mocks = createSchedulerMocks();
    mocks.executorMock.mockRejectedValueOnce(new Error('spawn EACCES'));
    const scheduler = createTestScheduler(testDb.db, mocks);

    await expect(scheduler.triggerJob('j')).rejects.toThrow('spawn EACCES');
    expect(runsOf('j')).toEqual([
      { status: 'error', error: 'spawn EACCES', exit_code: null, finished: 1 },
    ]);
  });
});

describe('a run whose error cannot be recorded', () => {
  it('still rejects with the original error, logs the failure and frees the slot', async () => {
    addJob('j', 'script');
    testDb.db.exec(
      "CREATE TRIGGER no_finish BEFORE UPDATE ON runs BEGIN SELECT RAISE(ABORT, 'database is locked'); END;",
    );
    const mocks = createSchedulerMocks();
    mocks.executorMock.mockRejectedValueOnce(new Error('spawn EACCES'));
    const scheduler = createTestScheduler(testDb.db, mocks);

    await expect(scheduler.triggerJob('j')).rejects.toThrow('spawn EACCES');
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'j' }),
      'Failed to record the error run',
    );
    expect(scheduler.getRunningJobs()).toEqual([]);
  });
});

describe('thrownResult', () => {
  it('is an error result with the message and the elapsed time', () => {
    const startedAt = Date.now() - 50;
    const result = thrownResult(new Error('boom'), startedAt);
    expect(result).toMatchObject({
      status: 'error',
      error: 'boom',
      exitCode: null,
      tokens: null,
      resultMeta: null,
      stdoutTail: '',
      stderrTail: '',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(50);
  });

  it('uses the string form of a non-Error', () => {
    expect(thrownResult('nope', Date.now()).error).toBe('nope');
  });
});
