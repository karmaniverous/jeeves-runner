/**
 * SQLite connection manager using Node.js built-in node:sqlite.
 *
 * @module
 */

import type { Database } from 'node:sqlite';

export interface ConnectionOptions {
  dbPath: string;
}

export const createConnection = (
  _options: ConnectionOptions,
): Promise<Database> => {
  throw new Error('Not implemented');
};

export const closeConnection = (_db: Database): Promise<void> => {
  throw new Error('Not implemented');
};
