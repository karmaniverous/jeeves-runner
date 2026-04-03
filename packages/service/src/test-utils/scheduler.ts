/**
 * Shared test utilities for scheduler-related tests.
 *
 * @module
 */

import type { DatabaseSync } from 'node:sqlite';

import type { Logger } from 'pino';
import { vi } from 'vitest';

import type { Notifier } from '../notify/slack.js';
import type {
  ExecutionOptions,
  ExecutionResult,
} from '../scheduler/executor.js';
import { createScheduler } from '../scheduler/scheduler.js';
import { type RunnerConfig, runnerConfigSchema } from '../schemas/config.js';

/** Default successful execution result for mocking. */
export const DEFAULT_EXECUTION_RESULT: ExecutionResult = {
  status: 'ok',
  exitCode: 0,
  durationMs: 100,
  tokens: null,
  resultMeta: null,
  error: null,
  stdoutTail: 'output',
  stderrTail: '',
};

/** Create a mock notifier with vi.fn() stubs. */
export function createMockNotifier(): Notifier {
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

/** Create a mock logger with vi.fn() stubs. */
export function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** Create standard scheduler test mocks. */
export function createSchedulerMocks() {
  const executorMock = vi.fn((_opts: ExecutionOptions) =>
    Promise.resolve({ ...DEFAULT_EXECUTION_RESULT }),
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

  const logger = createMockLogger();

  return {
    executorMock,
    notifier,
    logger,
    notifySuccessMock,
    notifyFailureMock,
  };
}

/** Create a test RunnerConfig with reconciliation disabled. */
export function createTestConfig(
  overrides: Partial<RunnerConfig> = {},
): RunnerConfig {
  return {
    ...runnerConfigSchema.parse({}),
    reconcileIntervalMs: 0,
    ...overrides,
  };
}

/** Create a scheduler wired to test DB and mocks. */
export function createTestScheduler(
  db: DatabaseSync,
  mocks: ReturnType<typeof createSchedulerMocks>,
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
