/**
 * Tests for database maintenance tasks: run pruning, state expiry, queue retention.
 */

import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import { createMaintenance } from './maintenance.js';

describe('Maintenance', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should prune runs older than runRetentionDays', () => {
    const db = testDb.db;
    const logger = pino({ level: 'silent' });

    // Insert a job
    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script) VALUES ('j1', 'J1', '0 * * * *', 'echo 1')`,
    ).run();

    // Insert an old run (40 days ago)
    db.prepare(
      `INSERT INTO runs (job_id, status, started_at) VALUES ('j1', 'ok', datetime('now', '-40 days'))`,
    ).run();

    // Insert a recent run (5 days ago)
    db.prepare(
      `INSERT INTO runs (job_id, status, started_at) VALUES ('j1', 'ok', datetime('now', '-5 days'))`,
    ).run();

    const maintenance = createMaintenance(
      db,
      { runRetentionDays: 30, stateCleanupIntervalMs: 60000 },
      logger,
    );
    maintenance.runNow();
    maintenance.stop();

    const runs = db.prepare('SELECT * FROM runs').all();
    expect(runs).toHaveLength(1);
  });

  it('should clean expired state entries', () => {
    const db = testDb.db;
    const logger = pino({ level: 'silent' });

    // Insert expired state
    db.prepare(
      `INSERT INTO state (namespace, key, value, expires_at) VALUES ('ns', 'expired', 'v', datetime('now', '-1 hour'))`,
    ).run();

    // Insert non-expired state
    db.prepare(
      `INSERT INTO state (namespace, key, value, expires_at) VALUES ('ns', 'valid', 'v', datetime('now', '+1 hour'))`,
    ).run();

    // Insert state without expiry
    db.prepare(
      `INSERT INTO state (namespace, key, value) VALUES ('ns', 'permanent', 'v')`,
    ).run();

    const maintenance = createMaintenance(
      db,
      { runRetentionDays: 30, stateCleanupIntervalMs: 60000 },
      logger,
    );
    maintenance.runNow();
    maintenance.stop();

    const states = db
      .prepare('SELECT key FROM state ORDER BY key')
      .all() as Array<{ key: string }>;
    expect(states.map((s) => s.key)).toEqual(['permanent', 'valid']);
  });

  it('should prune old queue items based on retention_days', () => {
    const db = testDb.db;
    const logger = pino({ level: 'silent' });

    db.prepare(
      `INSERT INTO queues (id, name, max_attempts, retention_days) VALUES ('test-q', 'Test', 1, 7)`,
    ).run();

    // Old completed item (10 days ago)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) VALUES ('test-q', '"old"', 'done', datetime('now', '-10 days'))`,
    ).run();

    // Recent completed item (3 days ago)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) VALUES ('test-q', '"recent"', 'done', datetime('now', '-3 days'))`,
    ).run();

    // Pending item (never pruned)
    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status) VALUES ('test-q', '"pending"', 'pending')`,
    ).run();

    const maintenance = createMaintenance(
      db,
      { runRetentionDays: 30, stateCleanupIntervalMs: 60000 },
      logger,
    );
    maintenance.runNow();
    maintenance.stop();

    const items = db
      .prepare('SELECT payload FROM queue_items WHERE queue_id = ?')
      .all('test-q') as Array<{ payload: string }>;
    expect(items).toHaveLength(2);
    const payloads = items.map((i) => String(JSON.parse(i.payload)));
    expect(payloads).toEqual(expect.arrayContaining(['recent', 'pending']));
  });

  it('should use default 7-day retention for undefined queues', () => {
    const db = testDb.db;
    const logger = pino({ level: 'silent' });

    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) VALUES ('unknown', '"old"', 'done', datetime('now', '-10 days'))`,
    ).run();

    db.prepare(
      `INSERT INTO queue_items (queue_id, payload, status, finished_at) VALUES ('unknown', '"recent"', 'done', datetime('now', '-3 days'))`,
    ).run();

    const maintenance = createMaintenance(
      db,
      { runRetentionDays: 30, stateCleanupIntervalMs: 60000 },
      logger,
    );
    maintenance.runNow();
    maintenance.stop();

    const items = db
      .prepare("SELECT * FROM queue_items WHERE queue_id = 'unknown'")
      .all();
    expect(items).toHaveLength(1);
  });
});
