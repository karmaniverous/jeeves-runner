/**
 * The `trigger` command in-process (DD#92, DD#96): messages and exit codes for success, each failure kind (an error response prints its body's message), the URL-encoded id and the 30-minute timeout. The spawned-CLI tests in `index.test.ts` cover the wiring.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { triggerCommand } from './trigger-command.js';

const URL_ = 'http://127.0.0.1:1937';

const RESULT = {
  result: {
    status: 'ok',
    exitCode: 0,
    durationMs: 12,
    tokens: null,
    resultMeta: null,
    stdoutTail: 'done',
    stderrTail: '',
    error: null,
  },
};

/** Captured output. */
function capture() {
  const out = { log: [] as string[], error: [] as string[] };
  return {
    out,
    output: {
      log: (t: string) => out.log.push(t),
      error: (t: string) => out.error.push(t),
    },
  };
}

const reply = (status: number, body: string) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('triggerCommand', () => {
  it('prints the run result and exits 0', async () => {
    const { out, output } = capture();
    const fetch = reply(200, JSON.stringify(RESULT));
    const code = await triggerCommand({ url: URL_, id: 'a/b', output, fetch });
    expect(code).toBe(0);
    expect(out.log).toEqual([JSON.stringify(RESULT, null, 2)]);
    expect(fetch).toHaveBeenCalledWith(
      `${URL_}/jobs/a%2Fb/run`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  /** Fastify's standard error body. */
  const standard = (
    statusCode: number,
    code: string,
    error: string,
    message: string,
  ) => JSON.stringify({ statusCode, code, error, message });

  it.each([
    [
      404,
      standard(404, 'RUNNER_JOB_NOT_FOUND', 'Not Found', 'Job not found: x'),
      'Job not found: x',
    ],
    [
      409,
      standard(
        409,
        'RUNNER_MAX_CONCURRENCY',
        'Conflict',
        'Max concurrency reached; retry when a running job finishes.',
      ),
      'Max concurrency reached; retry when a running job finishes.',
    ],
    [
      500,
      standard(500, 'RUNNER_TRIGGER_FAILED', 'Internal Server Error', 'm'),
      'm',
    ],
    [
      500,
      '{"statusCode":500,"error":"Internal Server Error","message":"The server could not complete the request."}',
      'The server could not complete the request.',
    ],
    [502, 'Bad Gateway', 'Bad Gateway'],
    [503, '', 'HTTP 503'],
  ])(
    "reports HTTP %i with the body's message and exits 1",
    async (status, body, message) => {
      const { out, output } = capture();
      const code = await triggerCommand({
        url: URL_,
        id: 'x',
        output,
        fetch: reply(status, body),
      });
      expect(code).toBe(1);
      expect(out.error).toEqual([
        `Trigger failed (HTTP ${String(status)}): ${message}`,
      ]);
    },
  );

  it('reports a bodiless non-2xx (304) by its status', async () => {
    const { out, output } = capture();
    const fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 304 })),
    );
    const code = await triggerCommand({ url: URL_, id: 'x', output, fetch });
    expect(code).toBe(1);
    expect(out.error).toEqual(['Trigger failed (HTTP 304): HTTP 304']);
  });

  it('reports a non-JSON 2xx as an invalid response', async () => {
    const { out, output } = capture();
    const code = await triggerCommand({
      url: URL_,
      id: 'x',
      output,
      fetch: reply(200, 'not json'),
    });
    expect(code).toBe(1);
    expect(out.error).toEqual([
      'Trigger failed: triggerJob returned a response that is not JSON',
    ]);
  });

  it('reports a 2xx that is not a run result as an invalid response', async () => {
    const { out, output } = capture();
    await triggerCommand({
      url: URL_,
      id: 'x',
      output,
      fetch: reply(200, '{"status":"triggered"}'),
    });
    expect(out.error).toEqual([
      'Trigger failed: triggerJob response did not match the expected shape',
    ]);
  });

  it('reports an unreachable runner', async () => {
    const { out, output } = capture();
    const refused = () => Promise.reject(new TypeError('fetch failed'));
    const code = await triggerCommand({
      url: URL_,
      id: 'x',
      output,
      fetch: refused,
    });
    expect(code).toBe(1);
    expect(out.error).toEqual([
      `Runner not reachable at ${URL_}. Is it running?`,
    ]);
  });

  it('reports a bad runner URL as unreachable', async () => {
    const { out, output } = capture();
    const code = await triggerCommand({ url: 'not a url', id: 'x', output });
    expect(code).toBe(1);
    expect(out.error).toEqual([
      'Runner not reachable at not a url. Is it running?',
    ]);
  });

  it('reports a timeout, noting that the job keeps running', async () => {
    const { out, output } = capture();
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });
    const code = await triggerCommand({
      url: URL_,
      id: 'x',
      output,
      fetch: hang,
      timeoutMs: 20,
    });
    expect(code).toBe(1);
    expect(out.error).toEqual([
      'Trigger failed: triggerJob timed out after 20 ms (the job keeps running on the runner)',
    ]);
  });

  it('waits 30 minutes by default', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { output } = capture();
    await triggerCommand({
      url: URL_,
      id: 'x',
      output,
      fetch: reply(200, JSON.stringify(RESULT)),
    });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(1_800_000);
  });

  it('reports invalid input without calling the runner', async () => {
    const { out, output } = capture();
    const fetch = reply(200, '{}');
    const code = await triggerCommand({
      url: URL_,
      id: 42 as unknown as string,
      output,
      fetch,
    });
    expect(code).toBe(1);
    expect(out.error[0]).toMatch(
      /^Trigger failed: Invalid input for "triggerJob"/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes to the console by default', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await triggerCommand({
      url: URL_,
      id: 'x',
      fetch: reply(200, JSON.stringify(RESULT)),
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify(RESULT, null, 2));
  });
});
