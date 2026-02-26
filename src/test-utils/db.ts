/**
 * Shared test utilities for database setup and teardown.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { closeConnection, createConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';

/** Test database context. */
export interface TestDb {
  /** Database connection. */
  db: DatabaseSync;
  /** Database file path. */
  dbPath: string;
  /** Cleanup function to close DB and remove temp directory. */
  cleanup: () => void;
}

/** Create a temporary test database with migrations applied. */
export function createTestDb(): TestDb {
  const testDir = mkdtempSync(join(tmpdir(), 'jeeves-runner-test-'));
  const dbPath = join(testDir, 'test.db');
  const db = createConnection(dbPath);
  runMigrations(db);

  return {
    db,
    dbPath,
    cleanup: () => {
      closeConnection(db);
      // Windows can have file locks from WAL mode, retry a few times
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
    },
  };
}
