/**
 * SQLite connection manager. Creates DB file with parent directories, enables WAL mode for concurrency.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

  return db;
}

/**
 * Close a database connection cleanly.
 */
export function closeConnection(db: DatabaseSync): void {
  db.close();
}
