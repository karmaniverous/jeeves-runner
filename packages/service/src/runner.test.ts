/**
 * Basic tests for runner lifecycle.
 */

import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TestDb } from './test-utils/db.js';
import { createTestDb } from './test-utils/db.js';

let mockBindAddress: string | null = null;

interface CoreModule extends Record<string, unknown> {
  getBindAddress: (name: string) => string;
}

vi.mock('@karmaniverous/jeeves', async (importOriginal) => {
  const actual: CoreModule = await importOriginal();
  return {
    ...actual,
    getBindAddress: vi.fn((name: string) => {
      if (mockBindAddress !== null) return mockBindAddress;
      return actual.getBindAddress(name);
    }),
  };
});

/** Minimal config for tests — all notifications/gateway disabled. */
function testConfig(dbPath: string, port: number) {
  return {
    dbPath,
    port,
    host: '127.0.0.1',
    maxConcurrency: 5,
    reconcileIntervalMs: 0,
    shutdownGraceMs: 1000,
    runRetentionDays: 30,
    stateCleanupIntervalMs: 3600000,
    log: { level: 'fatal' as const },
    notifications: {
      defaultOnSuccess: null,
      defaultOnFailure: null,
    },
    gateway: { url: 'http://127.0.0.1:18789' },
    runners: {},
  };
}

describe('Runner', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    mockBindAddress = null;
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should start and stop cleanly', async () => {
    const runner = (await import('./runner.js')).createRunner(
      testConfig(testDb.dbPath, 18783),
      { logger: pino({ level: 'silent' }) },
    );

    await runner.start();

    // Verify API server is listening
    const response = await fetch('http://127.0.0.1:18783/status');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      name: string;
      status: string;
      version: string;
    };
    expect(body.name).toBe('runner');
    expect(body.status).toBe('healthy');
    expect(body.version).toBeDefined();

    await runner.stop();

    // Verify server is stopped (connection should be refused)
    await expect(fetch('http://127.0.0.1:18783/status')).rejects.toThrow();
  }, 20000);

  it('should use getBindAddress when available', async () => {
    mockBindAddress = '127.0.0.1';

    const { getBindAddress } = await import('@karmaniverous/jeeves');

    const runner = (await import('./runner.js')).createRunner(
      testConfig(testDb.dbPath, 18784),
      { logger: pino({ level: 'silent' }) },
    );

    await runner.start();

    expect(getBindAddress).toHaveBeenCalledWith('runner');

    const response = await fetch('http://127.0.0.1:18784/status');
    expect(response.status).toBe(200);

    await runner.stop();
  }, 20000);
});
