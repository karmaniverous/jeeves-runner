/**
 * Tests for scheduled runs dropped at maxConcurrency (#113, DD#73) and for
 * notification channel fallback (DD#77).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb, type TestDb } from '../test-utils/db.js';
import {
  createSchedulerMocks,
  createTestScheduler,
  DEFAULT_EXECUTION_RESULT,
} from '../test-utils/scheduler.js';
import type { ExecutionResult } from './executor.js';

/** Insert a job; `busy` is disabled so only a manual trigger runs it. */
function insertJob(
  testDb: TestDb,
  id: string,
  enabled: boolean,
  onFailure: string | null = null,
): void {
  testDb.db
    .prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled, on_failure)
       VALUES (?, ?, '* * * * *', '/s.js', ?, ?)`,
    )
    .run(id, `Job ${id}`, enabled ? 1 : 0, onFailure);
}

describe('scheduler maxConcurrency (#113)', () => {
  let testDb: TestDb;
  let mocks: ReturnType<typeof createSchedulerMocks>;
  let release: (r: ExecutionResult) => void;
  let busyRun: Promise<unknown> = Promise.resolve();

  beforeEach(() => {
    vi.useFakeTimers();
    testDb = createTestDb();
    mocks = createSchedulerMocks();
    release = () => undefined;
    // The first execution (the manual 'busy' run) holds the only slot.
    mocks.executorMock.mockImplementation(
      () =>
        new Promise<ExecutionResult>((resolve) => {
          release = resolve;
        }),
    );
  });

  afterEach(async () => {
    // Let the manual run finish writing before the DB closes.
    release({ ...DEFAULT_EXECUTION_RESULT });
    await busyRun;
    vi.useRealTimers();
    testDb.cleanup();
  });

  /** Occupy the single slot, then let the 'late' schedule fire. */
  async function fireLateWhileBusy(
    defaultOnFailure: string | null,
  ): Promise<ReturnType<typeof createTestScheduler>> {
    const scheduler = createTestScheduler(testDb.db, mocks, {
      maxConcurrency: 1,
      notifications: { defaultOnFailure, defaultOnSuccess: null },
    });
    scheduler.start();
    busyRun = scheduler.triggerJob('busy');
    await vi.advanceTimersByTimeAsync(60_000);
    return scheduler;
  }

  /** Skipped run rows. */
  function skippedRuns() {
    return testDb.db
      .prepare(
        "SELECT job_id, trigger, error FROM runs WHERE status = 'skipped'",
      )
      .all() as Array<{ job_id: string; trigger: string; error: string }>;
  }

  it('records the skipped scheduled run and alerts the job channel', async () => {
    insertJob(testDb, 'busy', false);
    insertJob(testDb, 'late', true, 'C-LATE');

    const scheduler = await fireLateWhileBusy('C-DEFAULT');

    expect(mocks.executorMock).toHaveBeenCalledTimes(1);
    expect(skippedRuns()).toEqual([
      {
        job_id: 'late',
        trigger: 'schedule',
        error: 'max_concurrency: 1/1 running (busy)',
      },
    ]);
    expect(mocks.notifyFailureMock).toHaveBeenCalledExactlyOnceWith(
      'Job late',
      0,
      'Scheduled run skipped: max_concurrency: 1/1 running (busy)',
      'C-LATE',
    );
    expect(scheduler.getRunningJobs()).toEqual(['busy']);
  });

  it('falls back to notifications.defaultOnFailure (DD#77)', async () => {
    insertJob(testDb, 'busy', false);
    insertJob(testDb, 'late', true);

    await fireLateWhileBusy('C-DEFAULT');

    expect(mocks.notifyFailureMock).toHaveBeenCalledExactlyOnceWith(
      'Job late',
      0,
      expect.any(String),
      'C-DEFAULT',
    );
  });

  it('logs, rather than leaks, a failing skip alert', async () => {
    insertJob(testDb, 'busy', false);
    insertJob(testDb, 'late', true, 'C-LATE');
    mocks.notifyFailureMock.mockRejectedValueOnce(new Error('slack down'));

    await fireLateWhileBusy(null);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: 'Job late' }),
      'Failure notification failed',
    );
  });

  it('records but does not alert when no channel is configured', async () => {
    insertJob(testDb, 'busy', false);
    insertJob(testDb, 'late', true);

    await fireLateWhileBusy(null);

    expect(skippedRuns()).toHaveLength(1);
    expect(mocks.notifyFailureMock).not.toHaveBeenCalled();
  });
});

describe('notification channel fallback for job results (DD#77)', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it.each([
    ['job channels win', 'C-JOB-F', 'C-JOB-S', 'C-JOB-S', 'C-JOB-F'],
    ['defaults fill missing channels', null, null, 'C-DEF-S', 'C-DEF-F'],
  ])(
    '%s',
    async (_label, onFailure, onSuccess, expectedSuccess, expectedFailure) => {
      testDb.db
        .prepare(
          `INSERT INTO jobs (id, name, schedule, script, on_failure, on_success)
           VALUES ('j', 'J', '0 0 * * *', '/s.js', ?, ?)`,
        )
        .run(onFailure, onSuccess);
      const mocks = createSchedulerMocks();
      const scheduler = createTestScheduler(testDb.db, mocks, {
        notifications: {
          defaultOnFailure: 'C-DEF-F',
          defaultOnSuccess: 'C-DEF-S',
        },
      });

      await scheduler.triggerJob('j');

      expect(mocks.dispatchResultMock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 'ok' }),
        'J',
        expectedSuccess,
        expectedFailure,
        expect.anything(),
      );
    },
  );
});
