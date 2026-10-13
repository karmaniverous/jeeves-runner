/**
 * Subprocess tests for `jeeves-runner sync-jobs` (CLI wiring and flags).
 * Source selection and exit codes are covered in-process by
 * sync-command.test.ts.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb, type TestDb } from '../../test-utils/db.js';

/**
 * Run the CLI from source via tsx, never from build output (dist/). tsx
 * honours the tsconfig `paths` mapping, so workspace packages resolve to
 * source as well.
 */
const CLI = `"${process.execPath}" --import tsx src/cli/jeeves-runner/index.ts`;

describe('sync-jobs command', () => {
  vi.setConfig({ testTimeout: 15000 });
  let testDb: TestDb;
  let configPath: string;
  let jobsDir: string;

  beforeEach(() => {
    testDb = createTestDb();
    const tmpDir = mkdtempSync(join(tmpdir(), 'sync-jobs-test-'));
    configPath = join(tmpDir, 'config.json');
    // Jobs dir is at <tmpDir>/scripts/jobs; scripts resolve relative to <tmpDir>/scripts/
    jobsDir = join(tmpDir, 'scripts', 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ dbPath: testDb.dbPath, port: 18780 }),
    );
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should sync jobs from a temp directory with valid job definitions', () => {
    writeFileSync(
      join(jobsDir, 'batch.json'),
      JSON.stringify([
        {
          id: 'sync-test-1',
          name: 'Sync Test 1',
          script: 'hello.ts',
          schedule: '0 0 * * *',
          description: 'A synced job',
        },
        {
          id: 'sync-test-2',
          name: 'Sync Test 2',
          script: 'world.ts',
          schedule: '*/5 * * * *',
          timeout_seconds: 60,
          enabled: false,
        },
      ]),
    );

    const result = execSync(
      `${CLI} sync-jobs --config "${configPath}" --jobs-dir "${jobsDir}"`,
      { encoding: 'utf-8' },
    );

    expect(result).toContain('2 added');
    expect(result).toContain('0 updated');
    expect(result).toContain('0 skipped');

    const rows = testDb.db
      .prepare('SELECT * FROM jobs ORDER BY id')
      .all() as Array<{
      id: string;
      name: string;
      enabled: number;
      timeout_ms: number | null;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe('sync-test-1');
    expect(rows[0]?.enabled).toBe(1);
    expect(rows[1]?.id).toBe('sync-test-2');
    expect(rows[1]?.enabled).toBe(0);
    expect(rows[1]?.timeout_ms).toBe(60000);
  });

  it('should report errors for invalid schedules', () => {
    writeFileSync(
      join(jobsDir, 'bad.json'),
      JSON.stringify([
        {
          id: 'bad-schedule',
          name: 'Bad Schedule',
          script: 'fail.ts',
          schedule: 'not-a-cron',
        },
      ]),
    );

    expect(() => {
      execSync(
        `${CLI} sync-jobs --config "${configPath}" --jobs-dir "${jobsDir}"`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('wires --scripts-dir, --dry-run, --reset-enabled and --prune through the CLI', () => {
    const scriptsDir = join(dirname(configPath), 'jeeves-scripts');
    mkdirSync(join(scriptsDir, 'bin'), { recursive: true });
    writeFileSync(
      join(scriptsDir, 'bin', 'jeeves-scripts.js'),
      `process.stdout.write(${JSON.stringify(
        JSON.stringify([
          { id: 'cli-job', manifest: { name: 'CLI', schedule: '0 * * * *' } },
        ]),
      )});`,
    );

    const result = execSync(
      `${CLI} sync-jobs --config "${configPath}" --scripts-dir "${scriptsDir}" --dry-run --reset-enabled --prune`,
      { encoding: 'utf-8' },
    );

    expect(result).toContain('DRY RUN: nothing written.');
    expect(result).toContain('  + cli-job');
    expect(testDb.db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({
      n: 0,
    });
  });
});
