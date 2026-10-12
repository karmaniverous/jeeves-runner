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

  it('keeps an operator-disabled job disabled on re-sync (#103)', () => {
    const jobDef = [
      { id: 'j', name: 'J', script: 'test.ts', schedule: '*/5 * * * *' },
    ];
    writeFileSync(join(jobsDir, 'test.json'), JSON.stringify(jobDef));
    syncJobs(testDb.db, jobsDir);
    testDb.db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('j');

    const result = syncJobs(testDb.db, jobsDir);

    const row = testDb.db
      .prepare('SELECT enabled FROM jobs WHERE id = ?')
      .get('j') as { enabled: number };
    expect(row.enabled).toBe(0);
    expect(result.details.enabledDrift).toEqual([
      { id: 'j', source: true, stored: false, reset: false },
    ]);
  });

  it('leaves fields a definition omits unchanged (DD#75)', () => {
    writeFileSync(
      join(jobsDir, 'test.json'),
      JSON.stringify([
        {
          id: 'j',
          name: 'J',
          script: 'test.ts',
          schedule: '*/5 * * * *',
          on_failure: 'C1',
        },
      ]),
    );
    syncJobs(testDb.db, jobsDir);
    writeFileSync(
      join(jobsDir, 'test.json'),
      JSON.stringify([
        { id: 'j', name: 'J2', script: 'test.ts', schedule: '*/5 * * * *' },
      ]),
    );

    const result = syncJobs(testDb.db, jobsDir);

    const row = testDb.db
      .prepare('SELECT name, on_failure FROM jobs WHERE id = ?')
      .get('j') as { name: string; on_failure: string };
    expect(row).toEqual({ name: 'J2', on_failure: 'C1' });
    expect(result.updated).toBe(1);
  });

  it.each([
    ['a non-object entry', ['nope'], 'job entry is not an object'],
    [
      'missing required fields',
      [{ id: 'x', name: 'X', schedule: '* * * * *' }],
      'missing or has invalid required fields',
    ],
    [
      'a non-numeric timeout',
      [
        {
          id: 'x',
          name: 'X',
          script: 's.js',
          schedule: '* * * * *',
          timeout_seconds: '60',
        },
      ],
      "job 'x' has invalid timeout_seconds",
    ],
    [
      'a non-boolean enabled',
      [
        {
          id: 'x',
          name: 'X',
          script: 's.js',
          schedule: '* * * * *',
          enabled: 'yes',
        },
      ],
      "job 'x' has invalid enabled field",
    ],
    [
      'a file that is not an array',
      { id: 'x' },
      'expected an array of job definitions',
    ],
  ])('skips %s as an error', (_label, content, message) => {
    writeFileSync(join(jobsDir, 'test.json'), JSON.stringify(content));

    const result = syncJobs(testDb.db, jobsDir);

    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([expect.stringContaining(message)]);
    expect(testDb.db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({
      n: 0,
    });
  });

  it('skips an unparseable file and still syncs the others', () => {
    writeFileSync(join(jobsDir, 'bad.json'), '{ not json');
    writeFileSync(
      join(jobsDir, 'good.json'),
      JSON.stringify([
        { id: 'ok', name: 'OK', script: 's.js', schedule: '* * * * *' },
      ]),
    );

    const result = syncJobs(testDb.db, jobsDir);

    expect(result.errors).toEqual([
      expect.stringMatching(/^Failed to parse bad\.json: /),
    ]);
    expect(result.added).toBe(1);
  });

  it('reports an unreadable jobs directory', () => {
    const result = syncJobs(testDb.db, join(jobsDir, 'missing'));

    expect(result.errors).toEqual([
      expect.stringMatching(/^Cannot read jobs directory: /),
    ]);
  });

  it('adds nothing when the directory has no JSON files', () => {
    const result = syncJobs(testDb.db, jobsDir);

    expect(result).toMatchObject({ added: 0, errors: [] });
  });

  it('stores an inline script as given, without resolving it as a path', () => {
    writeFileSync(
      join(jobsDir, 'test.json'),
      JSON.stringify([
        {
          id: 'inline',
          name: 'Inline',
          script: 'console.log(1)',
          source_type: 'inline',
          schedule: '* * * * *',
        },
      ]),
    );

    syncJobs(testDb.db, jobsDir);

    expect(
      testDb.db
        .prepare('SELECT script, source_type FROM jobs WHERE id = ?')
        .get('inline'),
    ).toEqual({ script: 'console.log(1)', source_type: 'inline' });
  });
});
