/**
 * Basic tests for runner lifecycle.
 */

import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRunner } from './runner.js';
import type { TestDb } from './test-utils/db.js';
import { createTestDb } from './test-utils/db.js';

/** Minimal config for tests — all notifications/gateway disabled. */
function testConfig(dbPath: string, port: number) {
  return {
    dbPath,
    port,
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
  };
}

describe('Runner', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should create runner with config', () => {
    const runner = createRunner(testConfig(testDb.dbPath, 18781), {
      logger: pino({ level: 'silent' }),
    });

    expect(runner).toHaveProperty('start');
    expect(runner).toHaveProperty('stop');
  });

  it('should accept custom logger via deps', () => {
    const customLogger = pino({ level: 'silent' });

    const runner = createRunner(testConfig(testDb.dbPath, 18782), {
      logger: customLogger,
    });

    expect(runner).toBeDefined();
  });

  it('should start and stop cleanly', async () => {
    const runner = createRunner(testConfig(testDb.dbPath, 18783), {
      logger: pino({ level: 'silent' }),
    });

    await runner.start();

    // Verify API server is listening
    const response = await fetch('http://127.0.0.1:18783/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    await runner.stop();

    // Verify server is stopped (connection should be refused)
    await expect(fetch('http://127.0.0.1:18783/health')).rejects.toThrow();
  });
});
