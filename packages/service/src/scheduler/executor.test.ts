/**
 * Tests for the job executor.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const isWindows = process.platform === 'win32';

import { executeJob, resolveCommand } from './executor.js';

describe('executeJob', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'jeeves-runner-exec-'));
  });

  afterEach(() => {
    try {
      rmSync(testDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should execute a successful script', async () => {
    const script = join(testDir, 'ok.js');
    writeFileSync(script, 'console.log("hello"); process.exit(0);');

    const result = await executeJob({
      script,
      dbPath: ':memory:',
      jobId: 'test',
      runId: 1,
    });

    expect(result.status).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.stdoutTail).toContain('hello');
    expect(result.error).toBeNull();
  });

  it('should capture exit code on failure', async () => {
    const script = join(testDir, 'fail.js');
    writeFileSync(script, 'console.error("something broke"); process.exit(1);');

    const result = await executeJob({
      script,
      dbPath: ':memory:',
      jobId: 'test',
      runId: 1,
    });

    expect(result.status).toBe('error');
    expect(result.exitCode).toBe(1);
    expect(result.stderrTail).toContain('something broke');
  });

  it('should parse JR_RESULT lines', async () => {
    const script = join(testDir, 'result.js');
    writeFileSync(
      script,
      'console.log("JR_RESULT:" + JSON.stringify({ tokens: 42 }));',
    );

    const result = await executeJob({
      script,
      dbPath: ':memory:',
      jobId: 'test',
      runId: 1,
    });

    expect(result.status).toBe('ok');
    expect(result.tokens).toBe(42);
  });

  it('should pass env vars to child process', async () => {
    const script = join(testDir, 'env.js');
    writeFileSync(
      script,
      `
      const { JR_DB_PATH, JR_JOB_ID, JR_RUN_ID } = process.env;
      console.log(JSON.stringify({ JR_DB_PATH, JR_JOB_ID, JR_RUN_ID }));
    `,
    );

    const result = await executeJob({
      script,
      dbPath: '/tmp/test.db',
      jobId: 'my-job',
      runId: 99,
    });

    expect(result.status).toBe('ok');
    const parsed = JSON.parse(result.stdoutTail) as Record<string, string>;
    expect(parsed.JR_DB_PATH).toBe('/tmp/test.db');
    expect(parsed.JR_JOB_ID).toBe('my-job');
    expect(parsed.JR_RUN_ID).toBe('99');
  });

  it.skipIf(!isWindows)('should execute a .cmd script', async () => {
    const script = join(testDir, 'test.cmd');
    writeFileSync(script, '@echo off\r\necho cmd-output\r\nexit /b 0\r\n');

    const result = await executeJob({
      script,
      dbPath: ':memory:',
      jobId: 'test',
      runId: 1,
    });

    expect(result.status).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.stdoutTail).toContain('cmd-output');
  });

  it.skipIf(!isWindows)(
    'should execute a .ps1 script',
    async () => {
      const script = join(testDir, 'test.ps1');
      writeFileSync(script, 'Write-Output "ps1-output"\nexit 0\n');

      const result = await executeJob({
        script,
        dbPath: ':memory:',
        jobId: 'test',
        runId: 1,
      });

      expect(result.status).toBe('ok');
      expect(result.exitCode).toBe(0);
      expect(result.stdoutTail).toContain('ps1-output');
    },
    20000,
  );

  it('should timeout long-running scripts', async () => {
    const script = join(testDir, 'slow.js');
    writeFileSync(script, 'setTimeout(() => { console.log("done"); }, 30000);');

    const result = await executeJob({
      script,
      dbPath: ':memory:',
      jobId: 'test',
      runId: 1,
      timeoutMs: 500,
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toContain('timed out');
  }, 10000);

  describe('resolveCommand', () => {
    it('should use custom runner for configured extension', () => {
      const cmd = resolveCommand('/path/to/script.ts', {
        ts: 'node /path/to/tsx/cli.mjs',
      });
      expect(cmd.command).toBe('node');
      expect(cmd.args).toEqual(['/path/to/tsx/cli.mjs', '/path/to/script.ts']);
    });

    it('should use custom runner with single-token command', () => {
      const cmd = resolveCommand('/path/to/script.py', {
        py: 'python3',
      });
      expect(cmd.command).toBe('python3');
      expect(cmd.args).toEqual(['/path/to/script.py']);
    });

    it('should fall back to node for .js without custom runner', () => {
      const cmd = resolveCommand('/path/to/script.js');
      expect(cmd.command).toBe('node');
      expect(cmd.args).toEqual(['/path/to/script.js']);
    });

    it('should fall back to node for unknown extensions', () => {
      const cmd = resolveCommand('/path/to/script.mjs');
      expect(cmd.command).toBe('node');
    });

    it('should fall back to powershell for .ps1', () => {
      const cmd = resolveCommand('/path/to/script.ps1');
      expect(cmd.command).toBe('powershell.exe');
      expect(cmd.args).toContain('-File');
    });

    it('should fall back to cmd.exe for .cmd', () => {
      const cmd = resolveCommand('/path/to/script.cmd');
      expect(cmd.command).toBe('cmd.exe');
    });

    it('should prefer custom runner over built-in default', () => {
      const cmd = resolveCommand('/path/to/script.js', {
        js: 'deno run',
      });
      expect(cmd.command).toBe('deno');
      expect(cmd.args).toEqual(['run', '/path/to/script.js']);
    });
  });

  it('should execute a .ts script via custom runner', async () => {
    const script = join(testDir, 'hello.ts');
    // Write plain JS that's also valid TS (no type syntax needed)
    writeFileSync(script, 'console.log("ts-output"); process.exit(0);');

    const result = await executeJob({
      script,
      dbPath: ':memory:',
      jobId: 'ts-test',
      runId: 1,
      runners: { ts: 'node' },
    });

    expect(result.status).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.stdoutTail).toContain('ts-output');
  });

  it('should execute an inline script', async () => {
    const result = await executeJob({
      script: 'console.log("inline-output"); process.exit(0);',
      dbPath: ':memory:',
      jobId: 'inline-test',
      runId: 1,
      sourceType: 'inline',
    });

    expect(result.status).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.stdoutTail).toContain('inline-output');
  });

  it('should capture errors from inline scripts', async () => {
    const result = await executeJob({
      script: 'console.error("inline-error"); process.exit(1);',
      dbPath: ':memory:',
      jobId: 'inline-fail',
      runId: 1,
      sourceType: 'inline',
    });

    expect(result.status).toBe('error');
    expect(result.exitCode).toBe(1);
    expect(result.stderrTail).toContain('inline-error');
  });
});
