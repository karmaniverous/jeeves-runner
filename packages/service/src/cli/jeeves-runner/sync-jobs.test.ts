import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../../test-utils/db.js';
import { createTestDb } from '../../test-utils/db.js';
import { syncJobs } from './sync-jobs.js';

describe('syncJobs', () => {
  let testDb: TestDb;
  let jobsDir: string;

  beforeEach(() => {
    testDb = createTestDb();
    jobsDir = join(testDb.dbPath, '..', 'jobs');
    mkdirSync(jobsDir, { recursive: true });
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('skips job with never-firing schedule', () => {
    const jobDef = [
      {
        id: 'never-fire',
        name: 'Never Fire',
        script: 'test.ts',
        schedule: { timezone: 'UTC', rules: [] },
      },
    ];
    writeFileSync(join(jobsDir, 'test.json'), JSON.stringify(jobDef));

    const result = syncJobs(testDb.db, jobsDir);

    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('no upcoming fire time'))).toBe(
      true,
    );
  });

  it('syncs job with flat RRStack schedule format', () => {
    const jobDef = [
      {
        id: 'flat-rrstack',
        name: 'Flat RRStack',
        script: 'test.ts',
        schedule: { freq: 'minutely', interval: 11, timezone: 'UTC' },
      },
    ];
    writeFileSync(join(jobsDir, 'test.json'), JSON.stringify(jobDef));

    const result = syncJobs(testDb.db, jobsDir);

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(0);

    const row = testDb.db
      .prepare('SELECT schedule FROM jobs WHERE id = ?')
      .get('flat-rrstack') as { schedule: string };

    // The schedule is stored as the JSON-stringified flat format;
    // tryParseRRStack repacks it at parse time, not at storage time.
    const stored = JSON.parse(row.schedule) as {
      freq: string;
      timezone: string;
    };
    expect(stored.freq).toBe('minutely');
    expect(stored.timezone).toBe('UTC');
  });

  it('syncs job with env and args fields', () => {
    const jobDef = [
      {
        id: 'env-args-test',
        name: 'Env Args Test',
        script: 'test.ts',
        schedule: '*/5 * * * *',
        env: { CUSTOMER: 'veterancrowd', MODE: 'live' },
        args: ['--verbose', '--dry-run'],
      },
    ];
    writeFileSync(join(jobsDir, 'test.json'), JSON.stringify(jobDef));

    const result = syncJobs(testDb.db, jobsDir);

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(0);

    const row = testDb.db
      .prepare('SELECT env, args FROM jobs WHERE id = ?')
      .get('env-args-test') as { env: string; args: string };
    expect(JSON.parse(row.env)).toEqual({
      CUSTOMER: 'veterancrowd',
      MODE: 'live',
    });
    expect(JSON.parse(row.args)).toEqual(['--verbose', '--dry-run']);
  });
});
