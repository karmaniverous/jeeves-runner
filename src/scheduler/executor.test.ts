/**
 * Tests for the job executor.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { executeJob } from './executor.js';

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
});
