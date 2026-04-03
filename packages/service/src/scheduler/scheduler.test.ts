/**
 * Tests for the job scheduler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runnerConfigSchema } from '../schemas/config.js';
import { createTestDb } from '../test-utils/db.js';
import {
  createSchedulerMocks,
  createTestScheduler,
} from '../test-utils/scheduler.js';

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

    const mocks = createSchedulerMocks();
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

    const mocks = createSchedulerMocks();
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

    const mocks = createSchedulerMocks();
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

    const mocks = createSchedulerMocks();
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
    const mocks = createSchedulerMocks();
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

    const mocks = createSchedulerMocks();
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
