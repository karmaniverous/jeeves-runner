/**
 * Shared CLI helpers for config loading and database access.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createConnection } from '../../db/connection.js';
import { runMigrations } from '../../db/migrations.js';
import { runnerConfigSchema } from '../../schemas/config.js';

/** Load and validate config from a JSON file path, or return defaults. */
export function loadConfig(configPath?: string) {
  if (configPath) {
    const raw = readFileSync(resolve(configPath), 'utf-8');
    return runnerConfigSchema.parse(JSON.parse(raw));
  }
  return runnerConfigSchema.parse({});
}

/** Open a migrated DB connection, run `fn`, then close. */
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
