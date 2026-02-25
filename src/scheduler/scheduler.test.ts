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

type CronCapture = { schedule: string; callback: () => void };
const capturedCrons: CronCapture[] = [];

vi.mock('croner', () => {
  class Cron {
    public schedule: string;
    public callback: () => void;

    public constructor(schedule: string, callback: () => void) {
      this.schedule = schedule;
      this.callback = callback;
      capturedCrons.push({ schedule, callback });
    }

    public stop(): void {
      // no-op
    }
  }

  return { Cron };
});

function createTestConfig(): RunnerConfig {
  return {
    port: 3100,
    dbPath: ':memory:',
    maxConcurrency: 5,
    runRetentionDays: 30,
    cursorCleanupIntervalMs: 3600000,
    shutdownGraceMs: 5000,
    notifications: {
      defaultOnFailure: null,
      defaultOnSuccess: null,
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

  const notifier: Notifier = {
    notifySuccess: vi.fn(() =>
      Promise.resolve(undefined),
    ) as unknown as Notifier['notifySuccess'],
    notifyFailure: vi.fn(() =>
      Promise.resolve(undefined),
    ) as unknown as Notifier['notifyFailure'],
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return { executorMock, notifier, logger };
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

    scheduler.stop();
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

    scheduler.stop();
    db.close();
  });
});
