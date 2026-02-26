/**
 * Basic tests for runner lifecycle.
 */

import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from './test-utils/db.js';
import { createTestDb } from './test-utils/db.js';
import { createRunner } from './runner.js';

describe('Runner', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should create runner with config', () => {
    const runner = createRunner(
      {
        dbPath: testDb.dbPath,
        port: 18781,
        maxConcurrency: 5,
        reconcileIntervalMs: 0,
        shutdownGraceMs: 1000,
        runRetentionDays: 30,
        cursorCleanupIntervalMs: 3600000,
        log: { level: 'silent', file: null },
        notifications: {
          slackTokenPath: null,
          defaultOnSuccess: null,
          defaultOnFailure: null,
        },
        gateway: { url: null, tokenPath: null },
      },
      { logger: pino({ level: 'silent' }) },
    );

    expect(runner).toHaveProperty('start');
    expect(runner).toHaveProperty('stop');
  });

  it('should accept custom logger via deps', () => {
    const customLogger = pino({ level: 'silent' });

    const runner = createRunner(
      {
        dbPath: testDb.dbPath,
        port: 18782,
        maxConcurrency: 5,
        reconcileIntervalMs: 0,
        shutdownGraceMs: 1000,
        runRetentionDays: 30,
        cursorCleanupIntervalMs: 3600000,
        log: { level: 'silent', file: null },
        notifications: {
          slackTokenPath: null,
          defaultOnSuccess: null,
          defaultOnFailure: null,
        },
        gateway: { url: null, tokenPath: null },
      },
      { logger: customLogger },
    );

    expect(runner).toBeDefined();
  });

  it('should start and stop cleanly', async () => {
    const runner = createRunner(
      {
        dbPath: testDb.dbPath,
        port: 18783,
        maxConcurrency: 5,
        reconcileIntervalMs: 0,
        shutdownGraceMs: 1000,
        runRetentionDays: 30,
        cursorCleanupIntervalMs: 3600000,
        log: { level: 'silent', file: null },
        notifications: {
          slackTokenPath: null,
          defaultOnSuccess: null,
          defaultOnFailure: null,
        },
        gateway: { url: null, tokenPath: null },
      },
      { logger: pino({ level: 'silent' }) },
    );

    await runner.start();

    // Verify API server is listening
    const response = await fetch('http://127.0.0.1:18783/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('ok');

    await runner.stop();

    // Verify server is stopped (connection should be refused)
    await expect(fetch('http://127.0.0.1:18783/health')).rejects.toThrow();
  });
});
