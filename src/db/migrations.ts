/**
 * Database schema migration runner.
 *
 * @module
 */

import type { Database } from 'node:sqlite';

export const runMigrations = (_db: Database): Promise<void> => {
  throw new Error('Not implemented');
};
