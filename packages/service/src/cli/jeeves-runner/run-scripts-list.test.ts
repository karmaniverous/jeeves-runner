import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb, type TestDb } from '../../test-utils/db.js';
import { runScriptsList, SyncFatalError } from './sync-jobs.js';

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

  it('throws SyncFatalError naming the launcher when it does not exist', () => {
    expect(() => runScriptsList(join(scriptsDir, 'nowhere'))).toThrow(
      /jeeves-scripts list --json failed \(.*nowhere/,
    );
  });

  it('throws SyncFatalError when list --json times out', () => {
    writeFileSync(
      join(scriptsDir, 'bin', 'jeeves-scripts.js'),
      'setTimeout(() => undefined, 10000);',
    );

    expect(() => runScriptsList(scriptsDir, 300)).toThrow(SyncFatalError);
  });
});
