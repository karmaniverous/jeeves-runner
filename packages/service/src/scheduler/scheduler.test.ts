/**
 * Tests for the job scheduler.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Notifier } from '../notify/slack.js';
import { type RunnerConfig, runnerConfigSchema } from '../schemas/config.js';
import { createTestDb } from '../test-utils/db.js';
import type { ExecutionOptions, ExecutionResult } from './executor.js';
import { createScheduler } from './scheduler.js';

function createTestConfig(overrides: Partial<RunnerConfig> = {}): RunnerConfig {
  return {
    ...runnerConfigSchema.parse({}),
    reconcileIntervalMs: 0,
    ...overrides,
  };
}

function createMocks() {
  const defaultResult: ExecutionResult = {
    status: 'ok',
    exitCode: 0,
    durationMs: 100,
    tokens: null,
    resultMeta: null,
    error: null,
    stdoutTail: 'output',
    stderrTail: '',
  };

  const executorMock = vi.fn((_opts: ExecutionOptions) =>
    Promise.resolve(defaultResult),
  );

  const notifySuccessMock = vi.fn(() => Promise.resolve(undefined));
  const notifyFailureMock = vi.fn(() => Promise.resolve(undefined));

  const notifier: Notifier = {
    notifySuccess: notifySuccessMock as unknown as Notifier['notifySuccess'],
    notifyFailure: notifyFailureMock as unknown as Notifier['notifyFailure'],
    dispatchResult: vi.fn(
      async () => {},
    ) as unknown as Notifier['dispatchResult'],
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    executorMock,
    notifier,
    logger,
    notifySuccessMock,
    notifyFailureMock,
  };
}

/** Create a scheduler wired to test DB and mocks. */
function createTestScheduler(
  db: DatabaseSync,
  mocks: ReturnType<typeof createMocks>,
  configOverrides: Partial<RunnerConfig> = {},
) {
  return createScheduler({
    db,
    executor: mocks.executorMock as unknown as (
      options: ExecutionOptions,
    ) => Promise<ExecutionResult>,
    notifier: mocks.notifier,
    config: createTestConfig(configOverrides),
    logger: mocks.logger as unknown as Logger,
  });
}

describe('createScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-reads job from database on scheduled execution (avoids stale closure)', async () => {
    const testDb = createTestDb();
    const db = testDb.db;
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('job1', 'Test Job', '* * * * *', '/path/to/original.js', 1);

    const mocks = createMocks();
    const scheduler = createTestScheduler(db, mocks);
    const { executorMock } = mocks;

    scheduler.start();

    // Update the job after scheduler has started.
    db.prepare('UPDATE jobs SET script = ? WHERE id = ?').run(
      '/path/to/updated.js',
      'job1',
    );

    // Advance time to trigger the scheduled fire.
    await vi.advanceTimersByTimeAsync(60_000);

    expect(executorMock).toHaveBeenCalledWith(
      expect.objectContaining({ script: '/path/to/updated.js' }),
    );

    void scheduler.stop();
    testDb.cleanup();
  });

  it('skips scheduled execution if job is disabled after startup', async () => {
    const testDb = createTestDb();
    const db = testDb.db;
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('job2', 'Test Job 2', '* * * * *', '/path/to/script.js', 1);

    const mocks = createMocks();
    const scheduler = createTestScheduler(db, mocks);
    const { executorMock } = mocks;

    scheduler.start();

    db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('job2');

    // Advance to fire — job should be skipped since disabled.
    await vi.advanceTimersByTimeAsync(60_000);

    expect(executorMock).not.toHaveBeenCalled();

    void scheduler.stop();
    testDb.cleanup();
  });

  it('tracks jobs that fail to register', () => {
    const testDb = createTestDb();
    const db = testDb.db;
    // Insert a job with an invalid schedule
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('bad-job', 'Bad Job', 'not-valid-cron', '/path/to/script.js', 1);

    // Insert a valid job
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('good-job', 'Good Job', '*/5 * * * *', '/path/to/script.js', 1);

    const mocks = createMocks();
    const { notifyFailureMock } = mocks;

    const scheduler = createTestScheduler(db, mocks, {
      notifications: {
        ...runnerConfigSchema.parse({}).notifications,
        defaultOnFailure: '#test-alerts',
      },
    });

    scheduler.start();

    const failed = scheduler.getFailedRegistrations();
    expect(failed).toContain('bad-job');
    expect(failed).not.toContain('good-job');

    expect(notifyFailureMock).toHaveBeenCalledWith(
      'jeeves-runner',
      0,
      expect.stringContaining('bad-job'),
      '#test-alerts',
    );

    void scheduler.stop();
    testDb.cleanup();
  });

  it('does not include valid schedules in failed registrations', () => {
    const testDb = createTestDb();
    const db = testDb.db;
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('valid-job', 'Valid Job', '*/5 * * * *', '/path/to/script.js', 1);

    const mocks = createMocks();
    const scheduler = createTestScheduler(db, mocks);

    scheduler.start();

    const failed = scheduler.getFailedRegistrations();
    expect(failed).toHaveLength(0);
    expect(mocks.notifyFailureMock).not.toHaveBeenCalled();

    void scheduler.stop();
    testDb.cleanup();
  });

  it('registers newly inserted enabled jobs on reconciliation', () => {
    const testDb = createTestDb();
    const db = testDb.db;
    const mocks = createMocks();
    const scheduler = createTestScheduler(db, mocks);

    scheduler.start();

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('new-job', 'New Job', '*/5 * * * *', '/path/to/script.js', 1);

    scheduler.reconcileNow();

    // The job should now be registered (we verify it doesn't appear in failures).
    expect(scheduler.getFailedRegistrations()).not.toContain('new-job');

    void scheduler.stop();
    testDb.cleanup();
  });

  it('removes disabled jobs on reconciliation', async () => {
    const testDb = createTestDb();
    const db = testDb.db;
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('job-disable', 'Disable Me', '*/5 * * * *', '/path/to/script.js', 1);

    const mocks = createMocks();
    const scheduler = createTestScheduler(db, mocks);
    const { executorMock } = mocks;

    scheduler.start();

    db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('job-disable');

    scheduler.reconcileNow();

    // Advance time — the disabled job should NOT fire.
    await vi.advanceTimersByTimeAsync(600_000);

    expect(executorMock).not.toHaveBeenCalled();

    void scheduler.stop();
    testDb.cleanup();
  });
});
