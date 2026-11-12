/**
 * A run whose execution throws (instead of returning a result) is finished as an `error` run with the thrown message, so a manual trigger answered `RUNNER_TRIGGER_FAILED` (DD#96) leaves its cause on the run; the throw still reaches the caller, the slot is freed, and the run is alerted like any other error run to the job's `on_failure`, else `notifications.defaultOnFailure` (#137). Neither a failure to record the run nor a failed alert hides the original error.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RunnerConfig } from '../schemas/config.js';
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

/** Insert one enabled job, optionally with its own failure channel. */
const addJob = (
  id: string,
  type: 'script' | 'session',
  onFailure: string | null = null,
) =>
  testDb.db
    .prepare(
      'INSERT INTO jobs (id, name, schedule, script, type, on_failure) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, `Job ${id}`, '0 0 * * *', 'x', type, onFailure);

/** Notification defaults for the scheduler config. */
const notifications = (
  defaultOnFailure: string | null,
): Partial<RunnerConfig> => ({
  notifications: { defaultOnFailure, defaultOnSuccess: 'C-SUCCESS' },
});

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

describe('the alert for a run whose execution throws (#137)', () => {
  it("goes to the job's own on_failure channel with the thrown message", async () => {
    addJob('s', 'session', 'C-JOB');
    const mocks = createSchedulerMocks();
    const scheduler = createTestScheduler(
      testDb.db,
      mocks,
      notifications('C-DEFAULT'),
    );

    await expect(scheduler.triggerJob('s')).rejects.toThrow(
      'Session job requires Gateway client',
    );
    expect(mocks.dispatchResultMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        status: 'error',
        error:
          'Session job requires Gateway client (gatewayUrl/gatewayApiKey not configured)',
      }),
      'Job s',
      'C-SUCCESS',
      'C-JOB',
      mocks.logger,
    );
  });

  it('falls back to notifications.defaultOnFailure when the job has none', async () => {
    addJob('j', 'script');
    const mocks = createSchedulerMocks();
    mocks.executorMock.mockRejectedValueOnce(new Error('spawn EACCES'));
    const scheduler = createTestScheduler(
      testDb.db,
      mocks,
      notifications('C-DEFAULT'),
    );

    await expect(scheduler.triggerJob('j')).rejects.toThrow('spawn EACCES');
    expect(mocks.dispatchResultMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 'error', error: 'spawn EACCES' }),
      'Job j',
      'C-SUCCESS',
      'C-DEFAULT',
      mocks.logger,
    );
  });

  it('rejects with the original error and logs when the alert itself fails', async () => {
    addJob('j', 'script', 'C-JOB');
    const mocks = createSchedulerMocks();
    mocks.executorMock.mockRejectedValueOnce(new Error('spawn EACCES'));
    mocks.dispatchResultMock.mockRejectedValueOnce(new Error('slack down'));
    const scheduler = createTestScheduler(testDb.db, mocks);

    await expect(scheduler.triggerJob('j')).rejects.toThrow('spawn EACCES');
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'j' }),
      'Failed to send the run notification',
    );
    expect(runsOf('j')).toEqual([
      { status: 'error', error: 'spawn EACCES', exit_code: null, finished: 1 },
    ]);
    expect(scheduler.getRunningJobs()).toEqual([]);
  });
});

describe('a run that finishes normally', () => {
  it('still returns its result when the alert fails', async () => {
    addJob('ok', 'script');
    const mocks = createSchedulerMocks();
    mocks.dispatchResultMock.mockRejectedValueOnce(new Error('slack down'));
    const scheduler = createTestScheduler(testDb.db, mocks);

    await expect(scheduler.triggerJob('ok')).resolves.toMatchObject({
      status: 'ok',
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'ok' }),
      'Failed to send the run notification',
    );
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
    expect(mocks.dispatchResultMock).toHaveBeenCalledOnce();
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
