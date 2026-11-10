/**
 * @module createRunnerClient.test
 * The client against a stub fetch: one method per catalog entry, invalid input refused before sending, per-call and per-entry timeouts (30 min for `triggerJob`), the raw error body kept, no retries. End-to-end runs against the real service live in the service package (`sdk-integration.test.ts`).
 */

import { RUNNER_CATALOG } from '@karmaniverous/jeeves-runner-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRunnerClient } from './createRunnerClient.js';
import { RunnerError } from './RunnerError.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const RESULT = {
  status: 'ok',
  exitCode: 0,
  durationMs: 1,
  tokens: null,
  resultMeta: null,
  stdoutTail: '',
  stderrTail: '',
  error: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRunnerClient', () => {
  it('has one method per catalog entry', () => {
    const client = createRunnerClient({
      baseUrl: 'http://x',
      fetch: vi.fn(),
    });
    expect(Object.keys(client).sort()).toEqual(
      RUNNER_CATALOG.entries.map((e) => e.name).sort(),
    );
  });

  it('sends the entry request and returns the parsed body', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json({ result: RESULT })));
    const client = createRunnerClient({
      baseUrl: 'http://x/',
      fetch: fetchImpl,
    });
    await expect(client.triggerJob({ id: 'a/b' })).resolves.toEqual({
      result: RESULT,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/jobs/a%2Fb/run',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refuses invalid input without sending anything', async () => {
    const fetchImpl = vi.fn();
    const client = createRunnerClient({
      baseUrl: 'http://x',
      fetch: fetchImpl,
    });
    await expect(
      client.createJob({
        id: 'x',
        name: '',
        schedule: '* * * * *',
        script: 's',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the status, body and raw text of an error response, without retrying', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({ error: 'Job not found' }, 404)),
    );
    const client = createRunnerClient({
      baseUrl: 'http://x',
      fetch: fetchImpl,
    });
    const err = await client
      .triggerJob({ id: 'nope' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunnerError);
    expect(err).toMatchObject({
      status: 404,
      code: 'http_404',
      body: { error: 'Job not found' },
      responseText: '{"error":"Job not found"}',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('times triggerJob out at 30 minutes and other calls at 120 s by default', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/run') ? json({ result: RESULT }) : json({ jobs: [] }),
      ),
    );
    const client = createRunnerClient({
      baseUrl: 'http://x',
      fetch: fetchImpl,
    });
    await client.triggerJob({ id: 'a' });
    expect(timeout).toHaveBeenLastCalledWith(1_800_000);
    await client.listJobs();
    expect(timeout).toHaveBeenLastCalledWith(120_000);
  });

  it('honours client and per-call timeouts', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn(() => Promise.resolve(json({ jobs: [] })));
    const client = createRunnerClient({
      baseUrl: 'http://x',
      timeoutMs: 5000,
      triggerTimeoutMs: 7000,
      fetch: fetchImpl,
    });
    await client.listJobs();
    expect(timeout).toHaveBeenLastCalledWith(5000);
    await client.listJobs(undefined, { timeoutMs: 42 });
    expect(timeout).toHaveBeenLastCalledWith(42);
    await expect(
      client.listJobs(undefined, { timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: 'invalid_options' });
  });

  it('reports a call that outlives its timeout as timeout', async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });
    const client = createRunnerClient({ baseUrl: 'http://x', fetch: hang });
    await expect(
      client.triggerJob({ id: 'slow' }, { timeoutMs: 20 }),
    ).rejects.toMatchObject({
      code: 'timeout',
      status: 0,
      message: 'triggerJob timed out after 20 ms',
    });
  });

  it('reports a refused connection as network_error', async () => {
    const refused = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED',
          }),
        }),
      );
    const client = createRunnerClient({ baseUrl: 'http://x', fetch: refused });
    await expect(client.status()).rejects.toMatchObject({
      code: 'network_error',
      status: 0,
    });
  });
});
