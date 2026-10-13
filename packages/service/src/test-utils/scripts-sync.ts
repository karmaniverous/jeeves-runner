/**
 * Shared harness for `syncJobsFromScriptsDir` tests: a temp DB, a scripts
 * dir and an in-memory `list --json` result.
 *
 * @module
 */

import { join } from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import {
  type ScriptsSyncOptions,
  syncJobsFromScriptsDir,
  type SyncResult,
} from '../cli/jeeves-runner/sync-jobs.js';
import { createTestDb, type TestDb } from './db.js';

/** A `list --json` entry with a manifest. */
export function entry(id: string, manifest: Record<string, unknown> = {}) {
  return {
    id,
    source: 'core',
    domain: 'admin',
    manifest: { name: `Job ${id}`, schedule: '*/5 * * * *', ...manifest },
  };
}

/** Stored fields of one job, or `undefined` when it is not registered. */
export function row(testDb: TestDb, id: string) {
  return testDb.db
    .prepare(
      'SELECT name, schedule, script, args, enabled, on_failure FROM jobs WHERE id = ?',
    )
    .get(id) as
    | {
        name: string;
        schedule: string;
        script: string;
        args: string;
        enabled: number;
        on_failure: string | null;
      }
    | undefined;
}

/** Per-test state of the harness. */
export interface ScriptsSyncHarness {
  /** Temp database (fresh per test). */
  testDb: TestDb;
  /** Scripts dir passed to the sync. */
  scriptsDir: string;
  /** Entries the fake `list --json` returns. */
  list: unknown[];
  /** Sync from {@link ScriptsSyncHarness.list}. */
  sync: (options?: ScriptsSyncOptions) => SyncResult;
}

/** Register per-test setup/teardown and return the harness. */
export function useScriptsSync(): ScriptsSyncHarness {
  const h = { list: [] as unknown[] } as ScriptsSyncHarness;
  h.sync = (options = {}) =>
    syncJobsFromScriptsDir(h.testDb.db, h.scriptsDir, {
      listRunner: () => JSON.stringify(h.list),
      ...options,
    });

  beforeEach(() => {
    h.testDb = createTestDb();
    h.scriptsDir = join(h.testDb.dbPath, '..', 'scripts');
    h.list = [];
  });

  afterEach(() => {
    h.testDb.cleanup();
  });

  return h;
}
