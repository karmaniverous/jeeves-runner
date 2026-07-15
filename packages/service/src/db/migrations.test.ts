/**
 * Tests for database migrations. Focuses on behavioral properties:
 * idempotency, version tracking, and data preservation across re-runs.
 *
 * Table/index existence is implicitly tested by every other test file
 * that uses createTestDb() � no need to assert schema shape here.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import { runMigrations } from './migrations.js';

describe('Migrations', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should be idempotent (safe to run multiple times)', () => {
    runMigrations(testDb.db);
    runMigrations(testDb.db);

    // Should not throw; tables intact
    const count = (
      testDb.db
        .prepare(
          `SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
        )
        .get() as { c: number }
    ).c;
    expect(count).toBeGreaterThan(0);
  });

  it('migration 006 adds env and args columns', () => {
    // After runMigrations, check columns exist
    const columns = testDb.db
      .prepare("PRAGMA table_info('jobs')")
      .all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('env');
    expect(columnNames).toContain('args');
  });

  it('schema_version reaches 6', () => {
    const row = testDb.db
      .prepare('SELECT MAX(version) as v FROM schema_version')
      .get() as { v: number };
    expect(row.v).toBe(6);
  });

  it('should preserve existing data across re-migration', () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script) VALUES (?, ?, ?, ?)`,
      )
      .run('test-job', 'Test', '0 0 * * *', 'echo test');

    runMigrations(testDb.db);

    const job = testDb.db
      .prepare(`SELECT id FROM jobs WHERE id = ?`)
      .get('test-job') as { id: string } | undefined;
    expect(job?.id).toBe('test-job');
  });
});
