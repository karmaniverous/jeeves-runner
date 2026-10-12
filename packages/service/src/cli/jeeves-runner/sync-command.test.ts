/**
 * In-process tests for the `sync-jobs` command: source selection, flag
 * conflicts, exit codes and the end-to-end jeeves-scripts path.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb, type TestDb } from '../../test-utils/db.js';
import { runSyncCommand, type SyncOutput } from './sync-command.js';
import { SyncFatalError } from './sync-jobs.js';

/** One `list --json` entry. */
const entry = (id: string, schedule = '*/5 * * * *') => ({
  id,
  manifest: { name: `Job ${id}`, schedule },
});

describe('runSyncCommand', () => {
  let testDb: TestDb;
  let root: string;
  let out: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  /** Write a runner config next to the test DB; return its path. */
  function writeConfig(extra: Record<string, unknown> = {}): string {
    const path = join(root, 'runner.config.json');
    writeFileSync(path, JSON.stringify({ dbPath: testDb.dbPath, ...extra }));
    return path;
  }

  /** Ids of registered jobs. */
  const jobIds = () =>
    (
      testDb.db.prepare('SELECT id FROM jobs ORDER BY id').all() as Array<{
        id: string;
      }>
    ).map((r) => r.id);

  /** Run with an in-memory list for whichever scripts dir is selected. */
  function run(
    options: Parameters<typeof runSyncCommand>[0],
    list: unknown[] = [entry('a')],
    seenDirs: string[] = [],
  ): number {
    return runSyncCommand(options, {
      out: out as unknown as SyncOutput,
      listRunner: (dir) => {
        seenDirs.push(dir);
        return JSON.stringify(list);
      },
    });
  }

  beforeEach(() => {
    testDb = createTestDb();
    root = dirname(testDb.dbPath);
    out = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('syncs end to end from a real launcher with --scripts-dir', () => {
    const scriptsDir = join(root, 'scripts');
    mkdirSync(join(scriptsDir, 'bin'), { recursive: true });
    writeFileSync(
      join(scriptsDir, 'bin', 'jeeves-scripts.js'),
      `if (process.argv.slice(2).join(' ') !== 'list --json') process.exit(9);
       process.stdout.write(${JSON.stringify(JSON.stringify([entry('e2e')]))});`,
    );

    const code = runSyncCommand(
      { config: writeConfig(), scriptsDir },
      { out: out as unknown as SyncOutput },
    );

    expect(code).toBe(0);
    expect(jobIds()).toEqual(['e2e']);
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('+ e2e'));
    expect(out.warn).not.toHaveBeenCalled();
  });

  it('uses config scriptsDir when no source flag is given', () => {
    const seen: string[] = [];

    expect(
      run(
        { config: writeConfig({ scriptsDir: 'from-config' }) },
        undefined,
        seen,
      ),
    ).toBe(0);

    expect(seen).toEqual(['from-config']);
    expect(jobIds()).toEqual(['a']);
  });

  it('lets --scripts-dir override config scriptsDir', () => {
    const seen: string[] = [];

    run(
      {
        config: writeConfig({ scriptsDir: 'from-config' }),
        scriptsDir: 'from-flag',
      },
      undefined,
      seen,
    );

    expect(seen).toEqual(['from-flag']);
  });

  it('rejects --scripts-dir with --jobs-dir and writes nothing', () => {
    const code = run({ config: writeConfig(), scriptsDir: 's', jobsDir: 'j' });

    expect(code).toBe(1);
    expect(out.error).toHaveBeenCalledWith(
      '--scripts-dir and --jobs-dir cannot be used together',
    );
    expect(jobIds()).toEqual([]);
  });

  it('warns on the legacy source and rejects --prune with it', () => {
    const code = run({
      config: writeConfig({ jobsDir: join(root, 'jobs') }),
      prune: true,
    });

    expect(code).toBe(1);
    expect(out.warn).toHaveBeenCalledWith(
      expect.stringContaining('deprecated'),
    );
    expect(out.error).toHaveBeenCalledWith(
      '--prune requires the jeeves-scripts source',
    );
  });

  it('syncs the legacy source from config jobsDir', () => {
    const jobsDir = join(root, 'jobs');
    mkdirSync(jobsDir);
    writeFileSync(
      join(jobsDir, 'jobs.json'),
      JSON.stringify([
        { id: 'legacy', name: 'L', script: 'x.js', schedule: '0 * * * *' },
      ]),
    );

    expect(run({ config: writeConfig({ jobsDir }) })).toBe(0);
    expect(jobIds()).toEqual(['legacy']);
  });

  it('exits 1 and writes nothing on a fatal list failure', () => {
    const code = runSyncCommand(
      { config: writeConfig(), scriptsDir: 's' },
      {
        out: out as unknown as SyncOutput,
        listRunner: () => {
          throw new SyncFatalError('list exploded');
        },
      },
    );

    expect(code).toBe(1);
    expect(out.error).toHaveBeenCalledWith(
      'Sync aborted, nothing written: list exploded',
    );
    expect(jobIds()).toEqual([]);
  });

  it('exits 1 when an entry is skipped for an error, still writing the rest', () => {
    const code = run({ config: writeConfig(), scriptsDir: 's' }, [
      entry('good'),
      entry('bad', 'not a schedule'),
    ]);

    expect(code).toBe(1);
    expect(jobIds()).toEqual(['good']);
  });

  it('--dry-run exits 0 and writes nothing', () => {
    expect(run({ config: writeConfig(), scriptsDir: 's', dryRun: true })).toBe(
      0,
    );
    expect(jobIds()).toEqual([]);
    expect(out.log).toHaveBeenCalledWith(
      expect.stringContaining('DRY RUN: nothing written.'),
    );
  });
});
