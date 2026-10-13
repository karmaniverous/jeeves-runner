import {
  DEFAULT_LAUNCHER_TIMEOUT_MS,
  getLauncherPath,
} from '@karmaniverous/jeeves-runner-core';
import { describe, expect, it } from 'vitest';

import { entry, row, useScriptsSync } from '../../test-utils/scripts-sync.js';
import {
  formatSyncReport,
  SyncFatalError,
  syncJobsFromScriptsDir,
} from './sync-jobs.js';

describe('syncJobsFromScriptsDir', () => {
  const h = useScriptsSync();

  it('adds launcher jobs and skips entries without a manifest', () => {
    h.list = [
      entry('a', { args: ['--x'] }),
      { id: 'b', source: 'core', manifest: null },
    ];

    const result = h.sync();

    expect(result.added).toBe(1);
    expect(row(h.testDb, 'b')).toBeUndefined();
    const a = row(h.testDb, 'a');
    expect(a?.script).toBe(getLauncherPath(h.scriptsDir));
    expect(JSON.parse(a?.args ?? 'null')).toEqual(['run', 'a', '--x']);
  });

  it('reports unchanged jobs on a second sync', () => {
    h.list = [entry('a')];
    h.sync();

    const result = h.sync();

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('adds a job with a prerequisite and prints it (DD#76)', () => {
    h.list = [entry('a', { prerequisite: 'gh auth login' })];

    const result = h.sync();

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(formatSyncReport(result)).toContain(
      '+ a (prerequisite: gh auth login)',
    );
  });

  it('applies manifest enabled only when adding (#103)', () => {
    h.list = [entry('a', { enabled: false })];
    h.sync();
    expect(row(h.testDb, 'a')?.enabled).toBe(0);

    h.testDb.db.prepare('UPDATE jobs SET enabled = 1 WHERE id = ?').run('a');
    const result = h.sync();

    expect(row(h.testDb, 'a')?.enabled).toBe(1);
    expect(result.details.enabledDrift).toEqual([
      { id: 'a', source: false, stored: true, reset: false },
    ]);
  });

  it('--reset-enabled overwrites enabled with the source value', () => {
    h.list = [entry('a')];
    h.sync();
    h.testDb.db.prepare('UPDATE jobs SET enabled = 0 WHERE id = ?').run('a');

    const result = h.sync({ resetEnabled: true });

    expect(row(h.testDb, 'a')?.enabled).toBe(1);
    expect(formatSyncReport(result)).toContain(
      '  a: source true, stored false (reset to source)',
    );
  });

  it('reverts an API schedule change and reports it (DD#66)', () => {
    h.list = [entry('a')];
    h.sync();
    h.testDb.db
      .prepare("UPDATE jobs SET schedule = '0 * * * *' WHERE id = ?")
      .run('a');

    const result = h.sync();

    expect(row(h.testDb, 'a')?.schedule).toBe('*/5 * * * *');
    expect(result.details.scheduleReverts).toEqual([
      { id: 'a', from: '0 * * * *', to: '*/5 * * * *' },
    ]);
  });

  it('leaves fields the manifest omits unchanged (DD#75)', () => {
    h.list = [entry('a', { on_failure: 'C1' })];
    h.sync();
    h.list = [entry('a')];

    h.sync();

    expect(row(h.testDb, 'a')?.on_failure).toBe('C1');
  });

  it('--dry-run writes nothing', () => {
    h.list = [entry('a')];

    const result = h.sync({ dryRun: true });

    expect(result.added).toBe(1);
    expect(row(h.testDb, 'a')).toBeUndefined();
    expect(formatSyncReport(result)).toContain('DRY RUN: nothing written.');
  });

  it('prints the full --dry-run report (DD#68)', () => {
    h.list = [entry('keep'), entry('drift'), entry('moved'), entry('gone')];
    h.sync();
    h.testDb.db
      .prepare('UPDATE jobs SET enabled = 0 WHERE id = ?')
      .run('drift');
    h.testDb.db
      .prepare("UPDATE jobs SET schedule = '0 * * * *' WHERE id = ?")
      .run('moved');
    h.list = [
      entry('keep'),
      entry('drift'),
      entry('moved'),
      entry('fresh', { prerequisite: 'gh auth login' }),
      entry('bad', { schedule: 'not a schedule' }),
    ];

    const report = formatSyncReport(h.sync({ dryRun: true }));

    expect(report.split('\n')).toEqual([
      'DRY RUN: nothing written.',
      'Added (1):',
      '  + fresh (prerequisite: gh auth login)',
      'Updated (1):',
      '  ~ moved',
      '      schedule: "0 * * * *" -> "*/5 * * * *"',
      'Unchanged (2)',
      'Skipped (1):',
      // The schedule parser's own message follows the colon.
      expect.stringMatching(/^ {2}! job 'bad' has invalid schedule: \S/),
      'Enabled drift (1):',
      '  drift: source true, stored false (kept; use --reset-enabled to apply)',
      'Schedule reverts (1):',
      '  moved: 0 * * * * -> */5 * * * *',
      'Orphans (1):',
      '  gone: enabled (use --prune to disable)',
      'Sync plan: 1 added, 1 updated, 2 unchanged, 1 skipped',
    ]);
  });

  it('gives a new job without timeout_seconds the 10s default, on insert only (DD#71)', () => {
    h.list = [entry('a')];
    h.sync();
    const timeout = () =>
      (
        h.testDb.db
          .prepare('SELECT timeout_ms FROM jobs WHERE id = ?')
          .get('a') as { timeout_ms: number | null }
      ).timeout_ms;
    expect(timeout()).toBe(DEFAULT_LAUNCHER_TIMEOUT_MS);

    h.testDb.db
      .prepare('UPDATE jobs SET timeout_ms = 300000 WHERE id = ?')
      .run('a');
    h.sync();

    expect(timeout()).toBe(300000);
  });

  it('rolls back every write when applying the plan fails', () => {
    h.testDb.db.exec(
      `CREATE TRIGGER fail_boom BEFORE INSERT ON jobs WHEN NEW.id = 'boom'
       BEGIN SELECT RAISE(ABORT, 'boom refused'); END`,
    );
    h.list = [entry('first'), entry('boom')];

    expect(() => h.sync()).toThrow(/boom refused/);
    expect(row(h.testDb, 'first')).toBeUndefined();
  });

  it('skips an invalid schedule as an error', () => {
    h.list = [entry('bad', { schedule: 'not a schedule' }), entry('ok')];

    const result = h.sync();

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
      h.list = [entry('x')];
      expect(() =>
        syncJobsFromScriptsDir(h.testDb.db, h.scriptsDir, { listRunner }),
      ).toThrow(SyncFatalError);
      expect(row(h.testDb, 'x')).toBeUndefined();
    });
  });
});
