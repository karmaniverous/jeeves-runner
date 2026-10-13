import { join } from 'node:path';

import { getLauncherPath } from '@karmaniverous/jeeves-runner-core';
import { describe, expect, it } from 'vitest';

import { entry, row, useScriptsSync } from '../../test-utils/scripts-sync.js';
import { formatSyncReport } from './sync-jobs.js';

describe('sync orphans (DD#69, DD#70)', () => {
  const h = useScriptsSync();

  beforeEach(() => {
    h.list = [entry('keep'), entry('gone')];
    h.sync();
    h.testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script) VALUES ('other', 'Other', '* * * * *', 'other.js')`,
      )
      .run();
    h.list = [entry('keep')];
  });

  it('reports orphans without --prune and changes nothing', () => {
    const result = h.sync();

    expect(result.details.orphans).toEqual([
      { id: 'gone', enabled: true, disabled: false },
    ]);
    expect(row(h.testDb, 'gone')?.enabled).toBe(1);
  });

  it('--prune disables launcher orphans only, never deletes', () => {
    const result = h.sync({ prune: true });

    expect(row(h.testDb, 'gone')?.enabled).toBe(0);
    expect(row(h.testDb, 'other')?.enabled).toBe(1);
    expect(formatSyncReport(result)).toContain('  gone: disabled');
  });

  it('reports an orphan that is already disabled, and leaves it alone', () => {
    h.sync({ prune: true });

    const result = h.sync({ prune: true });

    expect(result.details.orphans).toEqual([
      { id: 'gone', enabled: false, disabled: false },
    ]);
    expect(formatSyncReport(result)).toContain('  gone: already disabled');
  });

  it('does not rewrite a launcher path stored in another form', () => {
    const stored =
      process.platform === 'win32'
        ? getLauncherPath(h.scriptsDir).replace(/\\/g, '/')
        : getLauncherPath(join(h.scriptsDir, 'bin', '..'));
    h.testDb.db
      .prepare('UPDATE jobs SET script = ? WHERE id = ?')
      .run(stored, 'keep');

    const result = h.sync();

    expect(result.details.unchanged).toContain('keep');
    expect(row(h.testDb, 'keep')?.script).toBe(stored);
  });

  it('matches the launcher written in another form (no false orphans)', () => {
    const variant =
      process.platform === 'win32'
        ? getLauncherPath(h.scriptsDir).toUpperCase().replace(/\\/g, '/')
        : getLauncherPath(join(h.scriptsDir, 'bin', '..'));
    h.testDb.db
      .prepare('UPDATE jobs SET script = ? WHERE id = ?')
      .run(variant, 'keep');
    h.list = [entry('keep'), entry('gone')];

    const result = h.sync({ prune: true });

    expect(result.details.orphans).toEqual([]);
  });

  it('never treats a listed entry with an invalid schedule as an orphan', () => {
    h.list = [entry('keep'), entry('gone', { schedule: 'not a schedule' })];

    const result = h.sync({ prune: true });

    expect(result.skipped).toBe(1);
    expect(result.details.orphans).toEqual([]);
    expect(row(h.testDb, 'gone')?.enabled).toBe(1);
  });

  it('treats a runnable that lost its manifest as an orphan', () => {
    h.list = [entry('keep'), { id: 'gone', manifest: null }];

    const result = h.sync();

    expect(result.details.orphans).toEqual([
      { id: 'gone', enabled: true, disabled: false },
    ]);
  });
});
