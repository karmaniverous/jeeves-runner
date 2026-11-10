/**
 * @module readme.test
 * The README usage example, compiled by `tsc` and run against a stub runner, so the documented calls, types and error handling stay true.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createRunnerClient,
  isRunnerError,
  type RunnerInput,
  type RunnerResponse,
} from './index.js';

const RESULT = {
  status: 'ok',
  exitCode: 0,
  durationMs: 9,
  tokens: null,
  resultMeta: null,
  stdoutTail: '',
  stderrTail: '',
  error: null,
};

/** Stub runner: lists, run history, then a 409 for the trigger. */
const runnerReply = (url: string) => {
  if (url.endsWith('/jobs')) return Response.json({ jobs: [] });
  if (url.includes('/runs')) return Response.json({ runs: [] });
  return Response.json({ error: 'Max concurrency reached' }, { status: 409 });
};

describe('README usage', () => {
  it('runs as documented', async () => {
    const log = vi.fn();
    const runner = createRunnerClient({
      baseUrl: 'http://127.0.0.1:1937',
      fetch: (url) => Promise.resolve(runnerReply(url)),
    });

    // --- README example ---
    const { jobs } = await runner.listJobs();
    const { runs } = await runner.jobRuns({ id: 'poll-email', limit: 5 });

    try {
      const { result } = await runner.triggerJob({ id: 'poll-email' });
      log(result.status, result.durationMs);
    } catch (error) {
      if (isRunnerError(error) && error.status === 409) {
        log('Runner is at maxConcurrency; try later.');
      } else throw error;
    }
    // --- end ---

    expect(jobs).toEqual([]);
    expect(runs).toEqual([]);
    expect(log).toHaveBeenCalledWith('Runner is at maxConcurrency; try later.');
  });

  it('documents per-call timeouts and the exported types', async () => {
    const runner = createRunnerClient({
      baseUrl: 'http://x',
      fetch: () => Promise.resolve(Response.json({ result: RESULT })),
    });
    const input: RunnerInput<'triggerJob'> = { id: 'a' };
    const body: RunnerResponse<'triggerJob'> = await runner.triggerJob(input, {
      timeoutMs: 60_000,
    });
    expect(body.result.status).toBe('ok');
  });
});
