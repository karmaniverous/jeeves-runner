import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLauncherPath } from '@karmaniverous/jeeves-runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../../test-utils/db.js';
import { createTestDb } from '../../test-utils/db.js';
import {
  formatSyncReport,
  runScriptsList,
  SyncFatalError,
  syncJobsFromScriptsDir,
} from './sync-jobs.js';

/** A `list --json` entry with a manifest. */
function entry(id: string, manifest: Record<string, unknown> = {}) {
  return {
    id,
    source: 'core',
    domain: 'admin',
    manifest: { name: `Job ${id}`, schedule: '*/5 * * * *', ...manifest },
  };
}

/** Read one job row. */
function row(testDb: TestDb, id: string) {
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

describe('syncJobsFromScriptsDir', () => {
  let testDb: TestDb;
  let scriptsDir: string;
  let list: unknown[];

  /** Sync using the in-memory list. */
  const sync = (opts: Parameters<typeof syncJobsFromScriptsDir>[2] = {}) =>
    syncJobsFromScriptsDir(testDb.db, scriptsDir, {
      listRunner: () => JSON.stringify(list),
      ...opts,
    });

  beforeEach(() => {
    testDb = createTestDb();
    scriptsDir = join(testDb.dbPath, '..', 'scripts');
    list = [];
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('adds launcher jobs and skips entries without a manifest', () => {
    list = [
      entry('a', { args: ['--x'] }),
      { id: 'b', source: 'core', manifest: null },
    ];

    const result = sync();

    expect(result.added).toBe(1);
    expect(row(testDb, 'b')).toBeUndefined();
    const a = row(testDb, 'a');
    expect(a?.script).toBe(getLauncherPath(scriptsDir));
    expect(JSON.parse(a?.args ?? 'null')).toEqual(['run', 'a', '--x']);
  });

  it('reports unchanged jobs on a second sync', () => {
    list = [entry('a')];
    sync();

    const result = sync();

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('adds a job with a prerequisite and prints it (DD#76)', () => {
    list = [entry('a', { prerequisite: 'gh auth login' })];

    const result = sync();

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(formatSyncReport(result)).toContain(
      '+ a (prerequisite: gh auth login)',
    );
  });

  it('applies manifest enabled only when adding (#103)', () => {
    list = [entry('a', { enabled: false })];
    sync();
    expect(row(testDb, 'a')?.enabled).toBe(0);

    testDb.db.prepare('UPDATE jobs SET enabled = 1 WHERE id = ?').run('a');
    const result = sync();

    expect(row(testDb, 'a')?.enabled).toBe(1);
    expect(result.details.enabledDrift).toEqual([
      { id: 'a', source: false, stored: true, reset: false },
    ]);
  });

  it('--reset-enabled overwrites enabled with the source value', () => {
    list = [entry('a')];
    sync();
    testDb.db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('a');

    sync({ resetEnabled: true });

    expect(row(testDb, 'a')?.enabled).toBe(1);
  });

  it('reverts an API schedule change and reports it (DD#66)', () => {
    list = [entry('a')];
    sync();
    testDb.db
      .prepare("UPDATE jobs SET schedule = '0 * * * *' WHERE id = ?")
      .run('a');

    const result = sync();

    expect(row(testDb, 'a')?.schedule).toBe('*/5 * * * *');
    expect(result.details.scheduleReverts).toEqual([
      { id: 'a', from: '0 * * * *', to: '*/5 * * * *' },
    ]);
  });

  it('leaves fields the manifest omits unchanged (DD#75)', () => {
    list = [entry('a', { on_failure: 'C1' })];
    sync();
    list = [entry('a')];

    sync();

    expect(row(testDb, 'a')?.on_failure).toBe('C1');
  });

  it('--dry-run writes nothing', () => {
    list = [entry('a')];

    const result = sync({ dryRun: true });

    expect(result.added).toBe(1);
    expect(row(testDb, 'a')).toBeUndefined();
    expect(formatSyncReport(result)).toContain('DRY RUN: nothing written.');
  });

  it('skips an invalid schedule as an error', () => {
    list = [entry('bad', { schedule: 'not a schedule' }), entry('ok')];

    const result = sync();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(1);
  });

  describe('fatal list failures write nothing (DD#63)', () => {
    it.each([
      ['unparseable JSON', () => 'not json'],
      ['schema-invalid output', () => JSON.stringify([{ manifest: null }])],
      ['duplicate ids', () => JSON.stringify([entry('a'), entry('a')])],
      [
        'a failing list command',
        () => {
          throw new SyncFatalError('boom');
        },
      ],
    ])('%s', (_label, listRunner) => {
      list = [entry('x')];
      expect(() =>
        syncJobsFromScriptsDir(testDb.db, scriptsDir, { listRunner }),
      ).toThrow(SyncFatalError);
      expect(row(testDb, 'x')).toBeUndefined();
    });
  });

  describe('orphans (DD#69, DD#70)', () => {
    beforeEach(() => {
      list = [entry('keep'), entry('gone')];
      sync();
      testDb.db
        .prepare(
          `INSERT INTO jobs (id, name, schedule, script) VALUES ('other', 'Other', '* * * * *', 'other.js')`,
        )
        .run();
      list = [entry('keep')];
    });

    it('reports orphans without --prune and changes nothing', () => {
      const result = sync();

      expect(result.details.orphans).toEqual([
        { id: 'gone', enabled: true, disabled: false },
      ]);
      expect(row(testDb, 'gone')?.enabled).toBe(1);
    });

    it('--prune disables launcher orphans only, never deletes', () => {
      sync({ prune: true });

      expect(row(testDb, 'gone')?.enabled).toBe(0);
      expect(row(testDb, 'other')?.enabled).toBe(1);
    });

    it('matches the launcher written in another form (no false orphans)', () => {
      const variant =
        process.platform === 'win32'
          ? getLauncherPath(scriptsDir).toUpperCase().replace(/\\/g, '/')
          : getLauncherPath(join(scriptsDir, 'bin', '..'));
      testDb.db
        .prepare('UPDATE jobs SET script = ? WHERE id = ?')
        .run(variant, 'keep');
      list = [entry('keep'), entry('gone')];

      const result = sync({ prune: true });

      expect(result.details.orphans).toEqual([]);
    });
  });
});

describe('runScriptsList', () => {
  let testDb: TestDb;
  let scriptsDir: string;

  beforeEach(() => {
    testDb = createTestDb();
    scriptsDir = join(testDb.dbPath, '..', 'scripts');
    mkdirSync(join(scriptsDir, 'bin'), { recursive: true });
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('returns the launcher output for list --json', () => {
    writeFileSync(
      join(scriptsDir, 'bin', 'jeeves-scripts.js'),
      'process.stdout.write(JSON.stringify(process.argv.slice(2)));',
    );

    expect(JSON.parse(runScriptsList(scriptsDir))).toEqual(['list', '--json']);
  });

  it('throws SyncFatalError with stderr on a non-zero exit', () => {
    writeFileSync(
      join(scriptsDir, 'bin', 'jeeves-scripts.js'),
      "process.stderr.write('config invalid'); process.exit(2);",
    );

    expect(() => runScriptsList(scriptsDir)).toThrow(/config invalid/);
  });
});
