/**
 * Tests for spawn-worker dispatch functions.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dispatchSession } from './spawn-worker.js';

describe('dispatchSession', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'jeeves-spawn-worker-'));
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

  it('should resolve command via resolveCommand for .js worker', async () => {
    const workerPath = join(testDir, 'worker.js');
    writeFileSync(
      workerPath,
      'process.stdin.resume(); process.stdin.on("end", () => { console.log("ok"); process.exit(0); });',
    );

    const result = await dispatchSession(
      'test task',
      { jobId: 'test-job' },
      workerPath,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ok');
  });

  it('should use custom runner when specified', async () => {
    const workerPath = join(testDir, 'worker.ts');
    // Write plain JS that's also valid TS
    writeFileSync(
      workerPath,
      'process.stdin.resume(); process.stdin.on("end", () => { console.log("ts-ok"); process.exit(0); });',
    );

    const result = await dispatchSession(
      'test task',
      {
        jobId: 'test-job',
        runners: { ts: 'node' },
      },
      workerPath,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ts-ok');
  });

  it('should capture stdout from worker', async () => {
    const workerPath = join(testDir, 'worker.js');
    writeFileSync(
      workerPath,
      'process.stdin.resume(); process.stdin.on("end", () => { console.log("line1"); console.log("line2"); process.exit(0); });',
    );

    const result = await dispatchSession(
      'test task',
      { jobId: 'test-job' },
      workerPath,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('line1');
    expect(result.stdout).toContain('line2');
  });

  it('should pass flag args to worker', async () => {
    const workerPath = join(testDir, 'worker.js');
    writeFileSync(
      workerPath,
      'console.log(JSON.stringify(process.argv.slice(2))); process.exit(0);',
    );

    const result = await dispatchSession(
      'test task',
      {
        jobId: 'my-job',
        label: 'my-label',
        thinking: 'high',
      },
      workerPath,
    );

    expect(result.exitCode).toBe(0);
    const args = JSON.parse(result.stdout) as string[];
    expect(args).toContain('--job-id=my-job');
    expect(args).toContain('--label=my-label');
    expect(args).toContain('--thinking=high');
    expect(args).not.toContainEqual(expect.stringContaining('--timeout'));
  });
});
