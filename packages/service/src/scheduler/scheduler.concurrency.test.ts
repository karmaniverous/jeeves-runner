/**
 * Tests for scheduled runs dropped at maxConcurrency (#113, DD#73).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../test-utils/db.js';
import {
  createSchedulerMocks,
  createTestScheduler,
  DEFAULT_EXECUTION_RESULT,
} from '../test-utils/scheduler.js';
import type { ExecutionResult } from './executor.js';

describe('scheduler maxConcurrency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a skipped run and alerts when a scheduled fire hits the limit', async () => {
    const testDb = createTestDb();
    const db = testDb.db;
    const insert = db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled, on_failure)
       VALUES (?, ?, '* * * * *', '/s.js', 1, ?)`,
    );
    insert.run('busy', 'Busy', null);
    insert.run('late', 'Late', 'C-LATE');

    const mocks = createSchedulerMocks();
    let release: (r: ExecutionResult) => void = () => undefined;
    mocks.executorMock.mockImplementation(
      () =>
        new Promise<ExecutionResult>((resolve) => {
          release = resolve;
        }),
    );
    const scheduler = createTestScheduler(db, mocks, { maxConcurrency: 1 });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.executorMock).toHaveBeenCalledTimes(1);
    const skipped = db
      .prepare(
        "SELECT job_id, trigger, error FROM runs WHERE status = 'skipped'",
      )
      .all() as Array<{ job_id: string; trigger: string; error: string }>;
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.trigger).toBe('schedule');
    expect(skipped[0]?.error).toMatch(/^max_concurrency: 1\/1 running/);

    // Fire order between the two jobs is not guaranteed; derive expectations.
    const expected = {
      late: ['Late', 'C-LATE'],
      busy: ['Busy', null],
    } as const;
    const [name, channel] =
      expected[(skipped[0]?.job_id ?? 'busy') as keyof typeof expected];
    const calls = mocks.notifyFailureMock.mock.calls as unknown as Array<
      [string, number, string, string]
    >;
    expect(calls.length).toBe(channel === null ? 0 : 1);
    expect(calls.map((c) => [c[0], c[1], c[3]])).toEqual(
      channel === null ? [] : [[name, 0, channel]],
    );
    expect(calls.every((c) => c[2].includes('Scheduled run skipped'))).toBe(
      true,
    );

    release({ ...DEFAULT_EXECUTION_RESULT });
    void scheduler.stop();
    testDb.cleanup();
  });

  it('falls back to notifications.defaultOnFailure', async () => {
    const testDb = createTestDb();
    const db = testDb.db;
    const insert = db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, '* * * * *', '/s.js', 1)`,
    );
    insert.run('a', 'A');
    insert.run('b', 'B');

    const mocks = createSchedulerMocks();
    mocks.executorMock.mockImplementation(
      () => new Promise<ExecutionResult>(() => undefined),
    );
    const scheduler = createTestScheduler(db, mocks, {
      maxConcurrency: 1,
      notifications: { defaultOnFailure: 'C-DEFAULT', defaultOnSuccess: null },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.notifyFailureMock).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.any(String),
      'C-DEFAULT',
    );

    void scheduler.stop();
    testDb.cleanup();
  });
});
