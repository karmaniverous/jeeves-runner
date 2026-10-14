/**
 * Tests for custom runner tool registrations.
 */

import {
  DEFAULT_FETCH_TIMEOUT_MS,
  type PluginApi,
  type ToolResult,
} from '@karmaniverous/jeeves';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerRunnerCustomTools,
  TRIGGER_TIMEOUT_MS,
} from './runnerTools.js';

/** Create a mock PluginApi that captures registered tools. */
function createMockApi(): PluginApi & {
  tools: Map<
    string,
    (id: string, params: Record<string, unknown>) => Promise<ToolResult>
  >;
} {
  const tools = new Map<
    string,
    (id: string, params: Record<string, unknown>) => Promise<ToolResult>
  >();

  return {
    tools,
    registerTool(tool) {
      tools.set(tool.name, tool.execute);
    },
  };
}

describe('registerRunnerCustomTools', () => {
  let api: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    api = createMockApi();
    registerRunnerCustomTools(api, 'http://localhost:1937');
  });

  it('registers 16 custom tools (runner_status is now standard)', () => {
    expect(api.tools.size).toBe(16);

    const expected = [
      'runner_jobs',
      'runner_trigger',
      'runner_runs',
      'runner_job_detail',
      'runner_enable',
      'runner_disable',
      'runner_create_job',
      'runner_update_job',
      'runner_delete_job',
      'runner_update_script',
      'runner_list_queues',
      'runner_queue_status',
      'runner_queue_peek',
      'runner_list_namespaces',
      'runner_query_state',
      'runner_query_collection',
    ];

    for (const name of expected) {
      expect(api.tools.has(name)).toBe(true);
    }
  });

  it('does not register runner_status (now produced by factory)', () => {
    expect(api.tools.has('runner_status')).toBe(false);
  });

  it('runner_trigger calls POST /jobs/:id/run', async () => {
    const mockResult = { result: { status: 'ok', duration_ms: 1234 } };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResult), { status: 200 }),
    );

    const execute = api.tools.get('runner_trigger')!;
    const result = await execute('test', { jobId: 'poll-email' });

    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/jobs/poll-email/run',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    [
      'runner_trigger waits for long jobs',
      'runner_trigger',
      TRIGGER_TIMEOUT_MS,
    ],
    [
      'runner_runs keeps the fetch default',
      'runner_runs',
      DEFAULT_FETCH_TIMEOUT_MS,
    ],
  ])('%s', async (_label, tool, expected) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    );

    await api.tools.get(tool)!('test', { jobId: 'poll-email' });

    expect(timeout).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('runner_runs appends limit query param', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    );

    const execute = api.tools.get('runner_runs')!;
    await execute('test', { jobId: 'poll-email', limit: 5 });

    const [calledUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl).toBe(
      'http://localhost:1937/jobs/poll-email/runs?limit=5',
    );
    // jeeves 0.7.0 fetchJson adds its default timeout signal (#119).
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('runner_enable calls PATCH /jobs/:id/enable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const execute = api.tools.get('runner_enable')!;
    await execute('test', { jobId: 'my-job' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/jobs/my-job/enable',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('runner_create_job calls POST /jobs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, id: 'new-job' }), {
        status: 201,
      }),
    );

    const execute = api.tools.get('runner_create_job')!;
    const result = await execute('test', {
      id: 'new-job',
      name: 'New Job',
      schedule: '*/5 * * * *',
      script: '/path/to/script.js',
      source_type: 'path',
    });

    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/jobs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('runner_delete_job calls DELETE /jobs/:id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const execute = api.tools.get('runner_delete_job')!;
    const result = await execute('test', { jobId: 'old-job' });

    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/jobs/old-job',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('runner_query_state calls GET /state/:namespace', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ cursor: '12345' }), { status: 200 }),
    );

    const execute = api.tools.get('runner_query_state')!;
    const result = await execute('test', { namespace: 'poll-email' });

    expect(result.isError).toBeUndefined();
    const [calledUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl).toBe('http://localhost:1937/state/poll-email');
    // jeeves 0.7.0 fetchJson adds its default timeout signal (#119).
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns connection error when service unreachable', async () => {
    const connError = new TypeError('fetch failed');
    Object.defineProperty(connError, 'cause', {
      value: { code: 'ECONNREFUSED' },
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(connError);

    const execute = api.tools.get('runner_list_queues')!;
    const result = await execute('test', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not reachable');
  });
});
