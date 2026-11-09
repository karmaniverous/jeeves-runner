/**
 * `sync-jobs --dry-run` opens the database read-only (DD#82, #123): it never
 * creates the file or its directory, never migrates, and leaves an existing
 * database byte-identical, sidecars included.
 */

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { closeConnection, createConnection } from '../../db/connection.js';
import { runMigrations } from '../../db/migrations.js';
import { runSyncCommand, type SyncOutput } from './sync-command.js';

const entry = { id: 'a', manifest: { name: 'Job a', schedule: '0 * * * *' } };

describe('sync-jobs --dry-run', () => {
  let root: string;
  let out: {
    log: Mock<SyncOutput['log']>;
    warn: Mock<SyncOutput['warn']>;
    error: Mock<SyncOutput['error']>;
    info: Mock<SyncOutput['info']>;
  };

  /** Dry-run against a config whose dbPath is `dbPath`. */
  function dryRun(dbPath: string): number {
    const config = join(root, 'config.json');
    writeFileSync(config, JSON.stringify({ dbPath }));
    return runSyncCommand(
      { config, scriptsDir: 's', dryRun: true },
      { out, listRunner: () => JSON.stringify([entry]) },
    );
  }

  /** Create a migrated database and close it (WAL checkpointed, no sidecars). */
  function closedDb(
    path: string,
    prepare?: (db: ReturnType<typeof createConnection>) => void,
  ): void {
    const db = createConnection(path);
    runMigrations(db);
    prepare?.(db);
    closeConnection(db);
  }

  /** Directory listing and main-file bytes, to compare before and after. */
  const snapshot = (dbPath: string) => ({
    files: readdirSync(root).sort(),
    bytes: readFileSync(dbPath),
  });

  beforeEach(() => {
    // Space, '#' and '%' check the file: URI used for the immutable open.
    root = mkdtempSync(join(tmpdir(), 'dry run #%20 '));
    out = {
      log: vi.fn<SyncOutput['log']>(),
      warn: vi.fn<SyncOutput['warn']>(),
      error: vi.fn<SyncOutput['error']>(),
      info: vi.fn<SyncOutput['info']>(),
    };
  });

  afterEach(() => {
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  it('fails on a missing database without creating it or its directory', () => {
    const dbPath = join(root, 'nested', 'dir', 'runner.sqlite');

    expect(dryRun(dbPath)).toBe(1);

    expect(out.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `Cannot open the database read-only at ${dbPath}`,
      ),
    );
    expect(existsSync(join(root, 'nested'))).toBe(false);
    expect(out.log).not.toHaveBeenCalled();
  });

  it('plans against a closed WAL database, leaving it and its sidecars unchanged', () => {
    const dbPath = join(root, 'runner.sqlite');
    closedDb(dbPath);
    const before = snapshot(dbPath);
    expect(before.files).toEqual(['runner.sqlite']); // no -wal/-shm

    expect(dryRun(dbPath)).toBe(0);

    expect(out.log).toHaveBeenCalledWith(
      expect.stringContaining('DRY RUN: nothing written.'),
    );
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('  + a'));
    const after = snapshot(dbPath);
    expect(after.files).toEqual(['config.json', 'runner.sqlite']);
    expect(after.bytes.equals(before.bytes)).toBe(true);
  });

  it('reads through the WAL of a live connection without changing any file', () => {
    const dbPath = join(root, 'runner.sqlite');
    const live = createConnection(dbPath);
    runMigrations(live);
    live
      .prepare(
        "INSERT INTO jobs (id, name, schedule, script) VALUES ('a', 'Job a', '0 * * * *', 'x')",
      )
      .run();
    const before = snapshot(dbPath);
    const wal = readFileSync(`${dbPath}-wal`);

    try {
      expect(dryRun(dbPath)).toBe(0);
    } finally {
      // Compare before the live connection closes (closing checkpoints).
      const after = snapshot(dbPath);
      expect(after.files).toEqual(['config.json', ...before.files]);
      expect(after.bytes.equals(before.bytes)).toBe(true);
      expect(readFileSync(`${dbPath}-wal`).equals(wal)).toBe(true);
      closeConnection(live);
    }
    // The job committed by the live connection is seen: not an insert.
    expect(out.log).not.toHaveBeenCalledWith(expect.stringContaining('  + a'));
  });

  it('stops on pending migrations, reporting the versions, without migrating', () => {
    const dbPath = join(root, 'runner.sqlite');
    closedDb(dbPath, (db) => {
      db.exec('DELETE FROM schema_version WHERE version > 4');
    });
    const before = snapshot(dbPath);

    expect(dryRun(dbPath)).toBe(1);

    expect(out.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `The database at ${dbPath} is at schema version 4; migrations 5, 6 are pending.`,
      ),
    );
    expect(out.log).not.toHaveBeenCalled();
    const after = snapshot(dbPath);
    expect(after.files).toEqual(['config.json', ...before.files]);
    expect(after.bytes.equals(before.bytes)).toBe(true);
  });

  it('without --dry-run still creates and migrates a missing database', () => {
    const dbPath = join(root, 'new', 'runner.sqlite');
    const config = join(root, 'config.json');
    writeFileSync(config, JSON.stringify({ dbPath }));

    const code = runSyncCommand(
      { config, scriptsDir: 's' },
      { out, listRunner: () => JSON.stringify([entry]) },
    );

    expect(code).toBe(0);
    expect(existsSync(dbPath)).toBe(true);
  });
});
