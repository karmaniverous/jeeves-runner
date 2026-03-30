/**
 * Convenience factory for creating a runner client in job scripts.
 * Uses JR_DB_PATH environment variable or a provided path.
 *
 * @module
 */

import { createClient, type RunnerClient } from './client.js';

export type { RunnerClient };

/**
 * Create a runner client using the standard database path.
 * Honors `JR_DB_PATH` env var (set automatically by the executor).
 *
 * @param dbPath - Optional explicit database path. Falls back to JR_DB_PATH.
 */
export function getRunnerClient(dbPath?: string): RunnerClient {
  return createClient(dbPath ?? process.env.JR_DB_PATH);
}
