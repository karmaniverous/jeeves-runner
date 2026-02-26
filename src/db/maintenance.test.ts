/**
 * Tests for database maintenance tasks.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeConnection, createConnection } from './connection.js';
import { createMaintenance } from './maintenance.js';
import { runMigrations } from './migrations.js';

describe('Maintenance', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'jeeves-runner-test-'));
    dbPath = join(testDir, 'test.db');
    const db = createConnection(dbPath);
    runMigrations(db);
    closeConnection(db);
  });

  afterEach(() => {
    try {
      rmSync(testDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  it('should prune old queue items based on retention_days', () => {
    const db = createConnection(dbPath);
    const logger = pino({ level: 'silent' });

    // Create a test queue with 7-day retention
    db.prepare(
      `INSERT INTO queues (id, name, max_attempts, retention_days) 
       VALUES ('test-retention', 'Test Retention', 1, 7)`,
    ).run();

    // Insert an old completed item (10 days ago)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) 
       VALUES ('test-retention', '{"test": "old"}', 'done', datetime('now', '-10 days'))`,
    ).run();

    // Insert a recent completed item (3 days ago)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) 
       VALUES ('test-retention', '{"test": "recent"}', 'done', datetime('now', '-3 days'))`,
    ).run();

    // Insert a pending item (should never be pruned)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status) 
       VALUES ('test-retention', '{"test": "pending"}', 'pending')`,
    ).run();

    const maintenance = createMaintenance(
      db,
      { runRetentionDays: 30, cursorCleanupIntervalMs: 60000 },
      logger,
    );

    maintenance.runNow();

    // Check that old item was pruned
    const items = db
      .prepare('SELECT payload FROM queue_items WHERE queue_id = ?')
      .all('test-retention') as Array<{ payload: string }>;

    expect(items).toHaveLength(2);
    const payloads = items.map(
      (i) => JSON.parse(i.payload) as { test: string },
    );
    expect(payloads.some((p) => p.test === 'old')).toBe(false);
    expect(payloads.some((p) => p.test === 'recent')).toBe(true);
    expect(payloads.some((p) => p.test === 'pending')).toBe(true);

    maintenance.stop();
    closeConnection(db);
  });

  it('should use default retention when queue not defined', () => {
    const db = createConnection(dbPath);
    const logger = pino({ level: 'silent' });

    // Insert an old completed item for an undefined queue (10 days ago)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) 
       VALUES ('undefined-queue', '{"test": "old"}', 'done', datetime('now', '-10 days'))`,
    ).run();

    // Insert a recent completed item (3 days ago)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) 
       VALUES ('undefined-queue', '{"test": "recent"}', 'done', datetime('now', '-3 days'))`,
    ).run();

    const maintenance = createMaintenance(
      db,
      { runRetentionDays: 30, cursorCleanupIntervalMs: 60000 },
      logger,
    );

    maintenance.runNow();

    // Old item should be pruned (default 7-day retention)
    const items = db
      .prepare('SELECT payload FROM queue_items WHERE queue_id = ?')
      .all('undefined-queue') as Array<{ payload: string }>;

    expect(items).toHaveLength(1);
    const payload = JSON.parse(items[0].payload) as { test: string };
    expect(payload.test).toBe('recent');

    maintenance.stop();
    closeConnection(db);
  });
});
