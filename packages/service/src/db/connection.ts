/**
 * SQLite connection manager. Creates DB file with parent directories, enables WAL mode for concurrency.
 *
 * @module
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

/**
 * Create and configure a SQLite database connection.
 * Ensures parent directories exist and enables WAL mode for better concurrency.
 */
export function createConnection(dbPath: string): DatabaseSync {
  // Ensure parent directory exists
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  // Open database
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for better concurrency
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Wait up to 5s for write lock instead of failing immediately (SQLITE_BUSY).
  // Multiple runner child processes share this DB file concurrently.
  db.exec('PRAGMA busy_timeout = 5000;');

  return db;
}

/**
 * Open an existing database read-only without creating or changing any
 * file: no directory or database creation, no migrations, no pragmas that
 * write (DD#82). Throws if `dbPath` does not exist.
 *
 * SQLite creates the `-wal`/`-shm` sidecars when it opens a WAL database
 * read-only and they are absent (the runner is stopped and the WAL was
 * checkpointed). In that case nothing else has the database open, so it is
 * opened `immutable`, which needs no sidecars. When they exist (a live
 * runner, or a crash left a WAL), it is opened read-only through them.
 */
export function openReadOnlyConnection(dbPath: string): DatabaseSync {
  if (!existsSync(dbPath)) {
    throw new Error(`No database at ${dbPath}`);
  }
  const sidecars = existsSync(`${dbPath}-wal`) || existsSync(`${dbPath}-shm`);
  const target = sidecars ? dbPath : pathToFileURL(dbPath);
  if (target instanceof URL) target.searchParams.set('immutable', '1');

  const db = new DatabaseSync(target, { readOnly: true });
  // Connection setting only; writes nothing to the file.
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

/**
 * Close a database connection cleanly.
 */
export function closeConnection(db: DatabaseSync): void {
  db.close();
}
