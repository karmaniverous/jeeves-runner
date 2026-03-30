/**
 * Shared test utilities for route testing.
 *
 * @module
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { vi } from 'vitest';

import { registerRoutes } from '../api/routes.js';
import { createRunnerDescriptor } from '../descriptor.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import { runnerConfigSchema } from '../schemas/config.js';
import type { TestDb } from './db.js';
import { createTestDb } from './db.js';

/** Create a mock scheduler with vi.fn() stubs for all methods. */
export function createMockScheduler(): Scheduler & {
  triggerJobMock: Scheduler['triggerJob'];
  reconcileNowMock: Scheduler['reconcileNow'];
} {
  const triggerJobMock: Scheduler['triggerJob'] = vi.fn(() =>
    Promise.resolve({
      status: 'ok' as const,
      durationMs: 100,
      exitCode: 0,
      tokens: null,
      resultMeta: null,
      error: null,
      stdoutTail: '',
      stderrTail: '',
    }),
  );
  const reconcileNowMock: Scheduler['reconcileNow'] = vi.fn();

  return {
    start: vi.fn(),
    stop: vi.fn(() => Promise.resolve()),
    triggerJob: triggerJobMock,
    reconcileNow: reconcileNowMock,
    getRunningJobs: vi.fn(() => []),
    getFailedRegistrations: vi.fn(() => []),
    triggerJobMock,
    reconcileNowMock,
  };
}

/** Route test harness: sets up test DB, mock scheduler, and Fastify with routes. */
export interface RouteTestHarness {
  testDb: TestDb;
  app: FastifyInstance;
  scheduler: ReturnType<typeof createMockScheduler>;
}

/** Create a route test harness with DB, scheduler, and Fastify wired up. */
export async function createRouteTestHarness(): Promise<RouteTestHarness> {
  const testDb = createTestDb();
  const scheduler = createMockScheduler();
  const app = Fastify({ logger: false });
  const defaultConfig = runnerConfigSchema.parse({});

  const descriptor = createRunnerDescriptor();

  registerRoutes(app, {
    db: testDb.db,
    scheduler,
    getConfig: () => defaultConfig,
    version: '0.0.0-test',
    descriptor,
  });

  await app.ready();

  return { testDb, app, scheduler };
}
