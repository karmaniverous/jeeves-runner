/**
 * Tests for the job scheduler.
 */

import { DatabaseSync } from 'node:sqlite';

import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type { Notifier } from '../notify/slack.js';
import type { RunnerConfig } from '../schemas/config.js';
import type { ExecutionOptions, ExecutionResult } from './executor.js';
import { createScheduler } from './scheduler.js';

type CronCapture = {
  schedule: string;
  callback: () => void;
  stopped: { value: boolean };
};
const capturedCrons: CronCapture[] = [];

vi.mock('croner', async () => {
  const actualUnknown: unknown = await vi.importActual('croner');
  if (
    typeof actualUnknown !== 'object' ||
    actualUnknown === null ||
    !('CronPattern' in actualUnknown)
  ) {
    throw new Error('Failed to import actual croner module');
  }

  const actual = actualUnknown as { CronPattern: new (s: string) => unknown };

  class Cron {
    public schedule: string;
    public callback: () => void;
    public stopped: { value: boolean };

    public constructor(schedule: string, callback: () => void) {
      // Validate the schedule using real CronPattern (same as real Cron)
      new actual.CronPattern(schedule);
      this.schedule = schedule;
      this.callback = callback;
      this.stopped = { value: false };
      capturedCrons.push({ schedule, callback, stopped: this.stopped });
    }

    public stop(): void {
      this.stopped.value = true;
    }
  }

  return { Cron, CronPattern: actual.CronPattern };
});

function createTestConfig(): RunnerConfig {
  return {
    port: 3100,
    dbPath: ':memory:',
    maxConcurrency: 5,
    runRetentionDays: 30,
    cursorCleanupIntervalMs: 3600000,
    shutdownGraceMs: 5000,
    reconcileIntervalMs: 0,
    notifications: {
      defaultOnFailure: null,
      defaultOnSuccess: null,
    },
    gateway: {
      url: 'http://127.0.0.1:18789',
    },
    log: {
      level: 'info',
    },
  };
}

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule TEXT NOT NULL,
      script TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      timeout_ms INTEGER,
      overlap_policy TEXT NOT NULL DEFAULT 'skip',
      on_success TEXT,
      on_failure TEXT
    );

    CREATE TABLE runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      exit_code INTEGER,
      tokens INTEGER,
      result_meta TEXT,
      error TEXT,
      stdout_tail TEXT,
      stderr_tail TEXT,
      trigger TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
  `);
  return db;
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

describe('createScheduler', () => {
  it('re-reads job from database on scheduled execution (avoids stale closure)', async () => {
    capturedCrons.length = 0;

    const db = createDb();
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('job1', 'Test Job', '* * * * * *', '/path/to/original.js', 1);

    const { executorMock, notifier, logger } = createMocks();

    const scheduler = createScheduler({
      db,
      executor: executorMock as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier,
      config: createTestConfig(),
      logger: logger as unknown as Logger,
    });

    scheduler.start();
    expect(capturedCrons).toHaveLength(1);

    // Update the job after scheduler has started.
    db.prepare('UPDATE jobs SET script = ? WHERE id = ?').run(
      '/path/to/updated.js',
      'job1',
    );

    // Fire the captured cron callback.
    capturedCrons[0]?.callback();

    await vi.waitFor(() => {
      expect(executorMock).toHaveBeenCalledWith(
        expect.objectContaining({ script: '/path/to/updated.js' }),
      );
    });

    void scheduler.stop();
    db.close();
  });

  it('skips scheduled execution if job is disabled after startup', async () => {
    capturedCrons.length = 0;

    const db = createDb();
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('job2', 'Test Job 2', '* * * * * *', '/path/to/script.js', 1);

    const { executorMock, notifier, logger } = createMocks();

    const scheduler = createScheduler({
      db,
      executor: executorMock as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier,
      config: createTestConfig(),
      logger: logger as unknown as Logger,
    });

    scheduler.start();
    expect(capturedCrons).toHaveLength(1);

    db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('job2');

    capturedCrons[0]?.callback();

    // Give the callback a tick to run; it should exit before calling executor.
    await new Promise((r) => setTimeout(r, 10));

    expect(executorMock).not.toHaveBeenCalled();

    void scheduler.stop();
    db.close();
  });

  it('tracks jobs that fail to register', () => {
    capturedCrons.length = 0;

    const db = createDb();
    // Insert a job with an invalid schedule (e.g., value > 59 for minutes)
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('bad-job', 'Bad Job', '*/67 * * * *', '/path/to/script.js', 1);

    // Insert a valid job
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('good-job', 'Good Job', '*/5 * * * *', '/path/to/script.js', 1);

    const { executorMock, notifier, logger, notifyFailureMock } = createMocks();

    const config = createTestConfig();
    config.notifications.defaultOnFailure = '#test-alerts';

    const scheduler = createScheduler({
      db,
      executor: executorMock as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier,
      config,
      logger: logger as unknown as Logger,
    });

    scheduler.start();

    // The bad job should be in failedRegistrations
    const failed = scheduler.getFailedRegistrations();
    expect(failed).toContain('bad-job');
    expect(failed).not.toContain('good-job');

    // Verify notifier was called with the default failure channel
    expect(notifyFailureMock).toHaveBeenCalledWith(
      'jeeves-runner',
      0,
      expect.stringContaining('bad-job'),
      '#test-alerts',
    );

    void scheduler.stop();
    db.close();
  });

  it('does not include valid schedules in failed registrations', () => {
    capturedCrons.length = 0;

    const db = createDb();
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('valid-job', 'Valid Job', '*/5 * * * *', '/path/to/script.js', 1);

    const { executorMock, notifier, logger, notifyFailureMock } = createMocks();

    const scheduler = createScheduler({
      db,
      executor: executorMock as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier,
      config: createTestConfig(),
      logger: logger as unknown as Logger,
    });

    scheduler.start();

    const failed = scheduler.getFailedRegistrations();
    expect(failed).toHaveLength(0);
    expect(notifyFailureMock).not.toHaveBeenCalled();

    void scheduler.stop();
    db.close();
  });

  it('registers newly inserted enabled jobs on reconciliation', () => {
    capturedCrons.length = 0;

    const db = createDb();
    const { executorMock, notifier, logger } = createMocks();

    const scheduler = createScheduler({
      db,
      executor: executorMock as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier,
      config: createTestConfig(),
      logger: logger as unknown as Logger,
    });

    scheduler.start();
    expect(capturedCrons).toHaveLength(0);

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('new-job', 'New Job', '*/5 * * * *', '/path/to/script.js', 1);

    scheduler.reconcileNow();

    expect(capturedCrons).toHaveLength(1);
    expect(capturedCrons[0]?.schedule).toBe('*/5 * * * *');

    void scheduler.stop();
    db.close();
  });

  it('removes disabled jobs on reconciliation', () => {
    capturedCrons.length = 0;

    const db = createDb();
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('job-disable', 'Disable Me', '*/5 * * * *', '/path/to/script.js', 1);

    const { executorMock, notifier, logger } = createMocks();

    const scheduler = createScheduler({
      db,
      executor: executorMock as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier,
      config: createTestConfig(),
      logger: logger as unknown as Logger,
    });

    scheduler.start();
    expect(capturedCrons).toHaveLength(1);

    db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('job-disable');

    scheduler.reconcileNow();

    expect(capturedCrons[0]?.stopped.value).toBe(true);

    void scheduler.stop();
    db.close();
  });

  it('re-registers jobs whose schedule changes on reconciliation', () => {
    capturedCrons.length = 0;

    const db = createDb();
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('job-change', 'Change Me', '*/5 * * * *', '/path/to/script.js', 1);

    const { executorMock, notifier, logger } = createMocks();

    const scheduler = createScheduler({
      db,
      executor: executorMock as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier,
      config: createTestConfig(),
      logger: logger as unknown as Logger,
    });

    scheduler.start();
    expect(capturedCrons).toHaveLength(1);
    expect(capturedCrons[0]?.schedule).toBe('*/5 * * * *');

    db.prepare('UPDATE jobs SET schedule = ? WHERE id = ?').run(
      '*/10 * * * *',
      'job-change',
    );

    scheduler.reconcileNow();

    expect(capturedCrons[0]?.stopped.value).toBe(true);
    expect(capturedCrons).toHaveLength(2);
    expect(capturedCrons[1]?.schedule).toBe('*/10 * * * *');

    void scheduler.stop();
    db.close();
  });

  it('should skip job when already running (overlap_policy=skip)', async () => {
    capturedCrons.length = 0;
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        script TEXT NOT NULL,
        type TEXT DEFAULT 'script',
        enabled INTEGER NOT NULL DEFAULT 1,
        timeout_ms INTEGER,
        overlap_policy TEXT NOT NULL DEFAULT 'skip',
        on_success TEXT,
        on_failure TEXT
      );
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER,
        exit_code INTEGER,
        tokens INTEGER,
        result_meta TEXT,
        error TEXT,
        stdout_tail TEXT,
        stderr_tail TEXT,
        trigger TEXT
      );
    `);

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, overlap_policy) VALUES (?, ?, ?, ?, ?)`,
    ).run('overlap-test', 'Overlap Test', '* * * * *', 'echo test', 'skip');

    const executionLog: string[] = [];
    const mockExecutor = vi.fn(
      async (options: ExecutionOptions): Promise<ExecutionResult> => {
        executionLog.push(`start-${options.jobId}`);
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate slow execution
        executionLog.push(`end-${options.jobId}`);
        return {
          status: 'ok',
          durationMs: 100,
          exitCode: 0,
          tokens: null,
          resultMeta: null,
          error: null,
          stdoutTail: '',
          stderrTail: '',
        };
      },
    );

    const mockNotifier: Notifier = {
      notifySuccess: vi.fn(async () => {}),
      notifyFailure: vi.fn(async () => {}),
    };

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    const mockConfig: RunnerConfig = {
      dbPath: ':memory:',
      port: 18780,
      maxConcurrency: 10,
      reconcileIntervalMs: 0,
      shutdownGraceMs: 5000,
      runRetentionDays: 30,
      cursorCleanupIntervalMs: 3600000,
      log: { level: 'info' },
      notifications: {
        defaultOnSuccess: null,
        defaultOnFailure: null,
      },
      gateway: { url: 'http://127.0.0.1:18789' },
    };

    const scheduler = createScheduler({
      db,
      executor: mockExecutor,
      notifier: mockNotifier,
      config: mockConfig,
      logger: mockLogger,
    });

    scheduler.start();
    expect(capturedCrons).toHaveLength(1);

    // Fire the job twice in rapid succession
    const cron = capturedCrons[0];
    cron.callback(); // First fire
    cron.callback(); // Second fire (should be skipped)

    // Wait for first execution to complete
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should only execute once
    expect(executionLog.filter((l) => l.startsWith('start-'))).toHaveLength(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'overlap-test' }),
      expect.stringContaining('already running'),
    );

    await scheduler.stop();
    db.close();
  });

  it('should allow concurrent runs (overlap_policy=allow)', async () => {
    capturedCrons.length = 0;
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        script TEXT NOT NULL,
        type TEXT DEFAULT 'script',
        enabled INTEGER NOT NULL DEFAULT 1,
        timeout_ms INTEGER,
        overlap_policy TEXT NOT NULL DEFAULT 'skip',
        on_success TEXT,
        on_failure TEXT
      );
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER,
        exit_code INTEGER,
        tokens INTEGER,
        result_meta TEXT,
        error TEXT,
        stdout_tail TEXT,
        stderr_tail TEXT,
        trigger TEXT
      );
    `);

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, overlap_policy) VALUES (?, ?, ?, ?, ?)`,
    ).run('allow-test', 'Allow Test', '* * * * *', 'echo test', 'allow');

    const executionLog: string[] = [];
    const mockExecutor = vi.fn(
      async (options: ExecutionOptions): Promise<ExecutionResult> => {
        executionLog.push(`start-${options.jobId}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        executionLog.push(`end-${options.jobId}`);
        return {
          status: 'ok',
          durationMs: 100,
          exitCode: 0,
          tokens: null,
          resultMeta: null,
          error: null,
          stdoutTail: '',
          stderrTail: '',
        };
      },
    );

    const mockNotifier: Notifier = {
      notifySuccess: vi.fn(async () => {}),
      notifyFailure: vi.fn(async () => {}),
    };

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    const mockConfig: RunnerConfig = {
      dbPath: ':memory:',
      port: 18780,
      maxConcurrency: 10,
      reconcileIntervalMs: 0,
      shutdownGraceMs: 5000,
      runRetentionDays: 30,
      cursorCleanupIntervalMs: 3600000,
      log: { level: 'info' },
      notifications: {
        defaultOnSuccess: null,
        defaultOnFailure: null,
      },
      gateway: { url: 'http://127.0.0.1:18789' },
    };

    const scheduler = createScheduler({
      db,
      executor: mockExecutor,
      notifier: mockNotifier,
      config: mockConfig,
      logger: mockLogger,
    });

    scheduler.start();
    expect(capturedCrons).toHaveLength(1);

    // Fire the job twice in rapid succession
    const cron = capturedCrons[0];
    cron.callback(); // First fire
    await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
    cron.callback(); // Second fire (should also execute)

    // Wait for both executions to complete
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Should execute both times
    expect(executionLog.filter((l) => l.startsWith('start-'))).toHaveLength(2);

    await scheduler.stop();
    db.close();
  });
});
