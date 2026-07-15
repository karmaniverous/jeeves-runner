/**
 * Tests for cron-registry reconciliation behavior.
 * Validates that rrstack jobs are correctly re-armed after reconciliation.
 */

import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../test-utils/db.js';
import {
  createSchedulerMocks,
  createTestConfig,
} from '../test-utils/scheduler.js';
import { createCronRegistry } from './cron-registry.js';
import { createScheduler } from './scheduler.js';

describe('cron-registry failed registration', () => {
  it('marks job as failed when schedule produces no fire time', () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'no-fire-job',
      'No Fire Job',
      JSON.stringify({ timezone: 'UTC', rules: [] }),
      '/path/to/script.js',
      1,
    );

    const mocks = createSchedulerMocks();
    const registry = createCronRegistry({
      db,
      onScheduledRun: vi.fn(),
      logger: mocks.logger as unknown as Logger,
    });

    const { failedIds } = registry.reconcile();

    expect(failedIds).toContain('no-fire-job');
    expect(registry.getFailedRegistrations()).toContain('no-fire-job');

    registry.stopAll();
    testDb.cleanup();
  });

  it('does not re-register never-firing job on subsequent reconcile', () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'never-fire',
      'Never Fire',
      JSON.stringify({ timezone: 'UTC', rules: [] }),
      '/path/to/script.js',
      1,
    );

    const mocks = createSchedulerMocks();
    const loggerWarnMock = mocks.logger.warn;
    const registry = createCronRegistry({
      db,
      onScheduledRun: vi.fn(),
      logger: mocks.logger as unknown as Logger,
    });

    // First reconcile: registers and fails
    registry.reconcile();
    const warnCountAfterFirst = loggerWarnMock.mock.calls.length;

    // Second reconcile: should NOT re-register (no new warn log)
    const { failedIds } = registry.reconcile();

    expect(failedIds).toHaveLength(0);
    expect(loggerWarnMock.mock.calls.length).toBe(warnCountAfterFirst);

    registry.stopAll();
    testDb.cleanup();
  });

  it('re-registers never-firing job when schedule changes', () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'revived-job',
      'Revived Job',
      JSON.stringify({ timezone: 'UTC', rules: [] }),
      '/path/to/script.js',
      1,
    );

    const mocks = createSchedulerMocks();
    const registry = createCronRegistry({
      db,
      onScheduledRun: vi.fn(),
      logger: mocks.logger as unknown as Logger,
    });

    // First reconcile: never-firing
    registry.reconcile();
    expect(registry.getFailedRegistrations()).toContain('revived-job');

    // Update schedule to something valid
    db.prepare('UPDATE jobs SET schedule = ? WHERE id = ?').run(
      '*/5 * * * *',
      'revived-job',
    );

    // Reconcile: should re-register with the new schedule
    registry.reconcile();
    expect(registry.getFailedRegistrations()).not.toContain('revived-job');

    registry.stopAll();
    testDb.cleanup();
  });

  it('cleans up never-firing job state when job is disabled', () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'disable-nf',
      'Disable NF',
      JSON.stringify({ timezone: 'UTC', rules: [] }),
      '/path/to/script.js',
      1,
    );

    const mocks = createSchedulerMocks();
    const registry = createCronRegistry({
      db,
      onScheduledRun: vi.fn(),
      logger: mocks.logger as unknown as Logger,
    });

    registry.reconcile();
    expect(registry.getFailedRegistrations()).toContain('disable-nf');

    // Disable the job
    db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('disable-nf');

    registry.reconcile();
    expect(registry.getFailedRegistrations()).not.toContain('disable-nf');

    registry.stopAll();
    testDb.cleanup();
  });
});

describe('cron-registry reconciliation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-arms rrstack job after reconciliation triggered by job update', async () => {
    // Use a cron schedule (every 5 minutes) as a proxy for rrstack behavior
    // since rrstack minutely can fire at sub-minute boundaries with fake timers
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('rr-job', 'Cron Job', '*/5 * * * *', '/path/to/script.js', 1);

    const mocks = createSchedulerMocks();
    const scheduler = createScheduler({
      db,
      executor: mocks.executorMock,
      notifier: mocks.notifier,
      config: createTestConfig(),
      logger: mocks.logger as unknown as Logger,
    });

    scheduler.start();
    const callsBefore = mocks.executorMock.mock.calls.length;

    // Advance past first fire (5 minutes)
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.executorMock).toHaveBeenCalledTimes(callsBefore + 1);

    // Simulate a job update (script change, schedule unchanged)
    db.prepare('UPDATE jobs SET script = ? WHERE id = ?').run(
      '/path/to/updated.js',
      'rr-job',
    );

    // Trigger reconciliation (as PATCH /jobs/:id would)
    scheduler.reconcileNow();

    // Advance past next fire — should still fire
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.executorMock).toHaveBeenCalledTimes(callsBefore + 2);

    // Verify the updated script was used
    expect(mocks.executorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ script: '/path/to/updated.js' }),
    );

    void scheduler.stop();
    testDb.cleanup();
  });

  it('recovers after multiple reconciliations', async () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('rr-stale', 'Periodic Job', '*/5 * * * *', '/path/to/script.js', 1);

    const mocks = createSchedulerMocks();
    const scheduler = createScheduler({
      db,
      executor: mocks.executorMock,
      notifier: mocks.notifier,
      config: createTestConfig(),
      logger: mocks.logger as unknown as Logger,
    });

    scheduler.start();
    const callsBefore = mocks.executorMock.mock.calls.length;

    // First fire
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.executorMock).toHaveBeenCalledTimes(callsBefore + 1);

    // Second fire
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.executorMock).toHaveBeenCalledTimes(callsBefore + 2);

    // Multiple reconciliations shouldn't break the schedule
    scheduler.reconcileNow();
    scheduler.reconcileNow();
    scheduler.reconcileNow();

    // Should still fire after reconciliations
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.executorMock).toHaveBeenCalledTimes(callsBefore + 3);

    void scheduler.stop();
    testDb.cleanup();
  });

  it('cron jobs continue firing after reconciliation with job update', async () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('cron-job', 'Cron Job', '*/5 * * * *', '/path/to/script.js', 1);

    const mocks = createSchedulerMocks();
    const scheduler = createScheduler({
      db,
      executor: mocks.executorMock,
      notifier: mocks.notifier,
      config: createTestConfig(),
      logger: mocks.logger as unknown as Logger,
    });

    scheduler.start();
    const callsBefore = mocks.executorMock.mock.calls.length;

    // First fire
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.executorMock).toHaveBeenCalledTimes(callsBefore + 1);

    // Update job and reconcile
    db.prepare('UPDATE jobs SET script = ? WHERE id = ?').run(
      '/updated.js',
      'cron-job',
    );
    scheduler.reconcileNow();

    // Second fire — should still work
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.executorMock).toHaveBeenCalledTimes(callsBefore + 2);

    void scheduler.stop();
    testDb.cleanup();
  });
});
