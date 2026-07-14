import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../db/connection.js';
import { runMigrations } from '../../db/migrations.js';
import { syncJobs } from './sync-jobs.js';

describe('syncJobs', () => {
  let dbPath: string;
  let jobsDir: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `runner-sync-test-${String(Date.now())}`);
    mkdirSync(tempDir, { recursive: true });
    jobsDir = join(tempDir, 'jobs');
    mkdirSync(jobsDir);
    dbPath = join(tempDir, 'test.sqlite');
    const db = createConnection(dbPath);
    runMigrations(db);
    db.close();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
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

    const db = createConnection(dbPath);
    const result = syncJobs(db, jobsDir);
    db.close();

    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('no upcoming fire time'))).toBe(
      true,
    );
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

    const db = createConnection(dbPath);
    const result = syncJobs(db, jobsDir);

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(0);

    const row = db
      .prepare('SELECT env, args FROM jobs WHERE id = ?')
      .get('env-args-test') as { env: string; args: string };
    expect(JSON.parse(row.env)).toEqual({
      CUSTOMER: 'veterancrowd',
      MODE: 'live',
    });
    expect(JSON.parse(row.args)).toEqual(['--verbose', '--dry-run']);

    db.close();
  });
});
