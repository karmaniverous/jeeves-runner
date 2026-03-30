/**
 * Tests for session-type job execution through the full scheduler pipeline.
 * Validates that type='session' flows correctly from DB through
 * cron-registry → scheduler → session-executor.
 */

import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../gateway/client.js';
import type { Notifier } from '../notify/slack.js';
import { runnerConfigSchema } from '../schemas/config.js';
import { createTestDb } from '../test-utils/db.js';
import type { ExecutionOptions, ExecutionResult } from './executor.js';
import { createScheduler } from './scheduler.js';

function createMockNotifier(): Notifier {
  return {
    notifySuccess: vi.fn(() =>
      Promise.resolve(undefined),
    ) as unknown as Notifier['notifySuccess'],
    notifyFailure: vi.fn(() =>
      Promise.resolve(undefined),
    ) as unknown as Notifier['notifyFailure'],
    dispatchResult: vi.fn(
      async () => {},
    ) as unknown as Notifier['dispatchResult'],
  };
}

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('Scheduler session execution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes type=session jobs to session executor on manual trigger', async () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, type, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'session-job',
      'Session Test',
      '0 0 * * *',
      'Run a daily digest report',
      'session',
      1,
    );

    // Verify the type is stored correctly
    const row = db
      .prepare('SELECT type FROM jobs WHERE id = ?')
      .get('session-job') as { type: string };
    expect(row.type).toBe('session');

    // Track spawn calls via a standalone mock function
    const spawnFn = vi.fn().mockResolvedValue({
      sessionKey: 'mock-session-key',
      runId: 'mock-run-id',
    });

    const gateway: GatewayClient = {
      spawnSession: spawnFn,
      isSessionComplete: vi.fn().mockResolvedValue(true),
      getSessionInfo: vi.fn().mockResolvedValue({
        totalTokens: 500,
        model: 'claude-sonnet-4',
      }),
      getSessionHistory: vi.fn(),
    };

    const scriptExecutor = vi.fn((_opts: ExecutionOptions) =>
      Promise.resolve({
        status: 'ok' as const,
        exitCode: 0,
        durationMs: 100,
        tokens: null,
        resultMeta: null,
        error: null,
        stdoutTail: 'output',
        stderrTail: '',
      }),
    );

    const scheduler = createScheduler({
      db,
      executor: scriptExecutor as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier: createMockNotifier(),
      config: { ...runnerConfigSchema.parse({}), reconcileIntervalMs: 0 },
      logger: createMockLogger() as unknown as Logger,
      gatewayClient: gateway,
    });

    scheduler.start();
    const result = await scheduler.triggerJob('session-job');

    // Should have gone to session executor (gateway), NOT script executor
    expect(scriptExecutor).not.toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalledWith(
      'Run a daily digest report',
      expect.objectContaining({ label: 'session-job' }),
    );
    expect(result.status).toBe('ok');
    expect(result.tokens).toBe(500);

    void scheduler.stop();
    testDb.cleanup();
  });

  it('routes type=session jobs via scheduled fire', async () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, type, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'sched-session',
      'Scheduled Session',
      '* * * * *',
      'Generate weekly report',
      'session',
      1,
    );

    const spawnFn = vi.fn().mockResolvedValue({
      sessionKey: 'mock-session-key',
      runId: 'mock-run-id',
    });

    const gateway: GatewayClient = {
      spawnSession: spawnFn,
      isSessionComplete: vi.fn().mockResolvedValue(true),
      getSessionInfo: vi.fn().mockResolvedValue({
        totalTokens: 500,
        model: 'claude-sonnet-4',
      }),
      getSessionHistory: vi.fn(),
    };

    const scriptExecutor = vi.fn((_opts: ExecutionOptions) =>
      Promise.resolve({
        status: 'ok' as const,
        exitCode: 0,
        durationMs: 100,
        tokens: null,
        resultMeta: null,
        error: null,
        stdoutTail: 'output',
        stderrTail: '',
      }),
    );

    const scheduler = createScheduler({
      db,
      executor: scriptExecutor as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier: createMockNotifier(),
      config: { ...runnerConfigSchema.parse({}), reconcileIntervalMs: 0 },
      logger: createMockLogger() as unknown as Logger,
      gatewayClient: gateway,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);

    // Should have routed to session executor
    expect(scriptExecutor).not.toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalled();

    void scheduler.stop();
    testDb.cleanup();
  });

  it('errors gracefully when session job has no gateway client', async () => {
    const testDb = createTestDb();
    const { db } = testDb;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, type, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'no-gw-session',
      'No Gateway',
      '0 0 * * *',
      'Do something',
      'session',
      1,
    );

    const scheduler = createScheduler({
      db,
      executor: vi.fn() as unknown as (
        options: ExecutionOptions,
      ) => Promise<ExecutionResult>,
      notifier: createMockNotifier(),
      config: { ...runnerConfigSchema.parse({}), reconcileIntervalMs: 0 },
      logger: createMockLogger() as unknown as Logger,
      // No gatewayClient
    });

    scheduler.start();

    await expect(scheduler.triggerJob('no-gw-session')).rejects.toThrow(
      'Gateway client',
    );

    void scheduler.stop();
    testDb.cleanup();
  });
});
