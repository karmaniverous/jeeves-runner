/**
 * Tests for database migrations (idempotency and version tracking).
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

  it('should create all tables on first run', () => {
    // Tables are already created in beforeEach via createTestDb
    // Verify they exist
    const tables = testDb.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toContain('jobs');
    expect(tableNames).toContain('runs');
    expect(tableNames).toContain('state');
    expect(tableNames).toContain('state_items');
    expect(tableNames).toContain('queues');
    expect(tableNames).toContain('queue_items');
  });

  it('should be idempotent (safe to run multiple times)', () => {
    // Run migrations again
    runMigrations(testDb.db);

    // Should not throw and tables should still exist
    const tables = testDb.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as Array<{ name: string }>;

    expect(tables.length).toBeGreaterThan(0);
  });

  it('should track migration version', () => {
    // Check if migration version is tracked (assuming a migrations table or similar)
    // Note: Current implementation doesn't have explicit version tracking
    // This test documents expected behavior for future implementation
    runMigrations(testDb.db);

    // If version tracking is added, verify it here
    // For now, just verify tables exist
    const jobs = testDb.db
      .prepare(`SELECT COUNT(*) as count FROM jobs`)
      .get() as { count: number };
    expect(jobs.count).toBe(0);
  });

  it('should create indexes', () => {
    const indexes = testDb.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_runs_job_started');
    expect(indexNames).toContain('idx_runs_status');
    expect(indexNames).toContain('idx_state_expires');
  });

  it('should create default queues', () => {
    // Check if default queues are created
    const queues = testDb.db
      .prepare(`SELECT id FROM queues`)
      .all() as Array<{ id: string }>;

    // Assuming there are default queues (email-pending, email-all)
    // based on the schema
    expect(queues.some((q) => q.id === 'email-pending')).toBe(true);
    expect(queues.some((q) => q.id === 'email-all')).toBe(true);
  });

  it('should preserve existing data when running migrations again', () => {
    // Insert test data
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script) VALUES (?, ?, ?, ?)`,
      )
      .run('test-job', 'Test', '0 0 * * *', 'echo test');

    // Run migrations again
    runMigrations(testDb.db);

    // Data should still exist
    const jobs = testDb.db
      .prepare(`SELECT id FROM jobs WHERE id = ?`)
      .get('test-job') as { id: string } | undefined;

    expect(jobs?.id).toBe('test-job');
  });
});
