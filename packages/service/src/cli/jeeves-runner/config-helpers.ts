/**
 * Shared CLI helpers for config loading and database access.
 *
 * @module
 */

import { readFileSync } from 'node:fs';

import {
  createConnection,
  openReadOnlyConnection,
} from '../../db/connection.js';
import { getPendingMigrations, runMigrations } from '../../db/migrations.js';
import { type RunnerConfig, runnerConfigSchema } from '../../schemas/config.js';

/** Load and validate the config file at an absolute path. */
export function loadConfig(configPath: string): RunnerConfig {
  return runnerConfigSchema.parse(
    JSON.parse(readFileSync(configPath, 'utf-8')),
  );
}

/** Open a migrated DB connection (creating the file if needed), run `fn`, then close. */
export function withDb<T>(
  dbPath: string,
  fn: (db: ReturnType<typeof createConnection>) => T,
): T {
  const db = createConnection(dbPath);
  runMigrations(db);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** The database a read-only command needs is missing or not migrated. */
export class ReadOnlyDbError extends Error {
  /** @param message - What is wrong and what to do about it. */
  constructor(message: string) {
    super(message);
    this.name = 'ReadOnlyDbError';
  }
}

/**
 * Open an existing, fully migrated database read-only, run `fn`, then close
 * (DD#82). Never creates, migrates or otherwise writes the database.
 *
 * @throws ReadOnlyDbError when the file is missing or migrations are pending.
 */
export function withReadOnlyDb<T>(
  dbPath: string,
  fn: (db: ReturnType<typeof openReadOnlyConnection>) => T,
): T {
  let db: ReturnType<typeof openReadOnlyConnection>;
  try {
    db = openReadOnlyConnection(dbPath);
  } catch (err) {
    throw new ReadOnlyDbError(
      `Cannot open the database read-only at ${dbPath}: ${err instanceof Error ? err.message : String(err)}. ` +
        'A dry run never creates or migrates it; check -c/--config-root, or run without --dry-run.',
    );
  }
  try {
    const { current, pending } = getPendingMigrations(db);
    if (pending.length > 0) {
      throw new ReadOnlyDbError(
        `The database at ${dbPath} is at schema version ${String(current)}; migrations ${pending.join(', ')} are pending. ` +
          'A dry run does not migrate; run without --dry-run (or start the runner) to migrate first.',
      );
    }
    return fn(db);
  } finally {
    db.close();
  }
}
