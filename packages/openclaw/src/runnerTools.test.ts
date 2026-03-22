/**
 * Tests for runner tool registrations.
 */

import { type PluginApi, type ToolResult } from '@karmaniverous/jeeves';
import { describe, expect, it, vi } from 'vitest';

import { registerRunnerTools } from './runnerTools.js';

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

describe('registerRunnerTools', () => {
  it('registers all 17 tools', () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    expect(api.tools.size).toBe(17);

    const expected = [
      'runner_status',
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

  it('runner_status calls GET /stats', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    const mockResponse = {
      totalJobs: 28,
      running: 0,
      failedRegistrations: 0,
      okLastHour: 15,
      errorsLastHour: 0,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const execute = api.tools.get('runner_status')!;
    const result = await execute('test', {});

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/stats',
      undefined,
    );
  });

  it('runner_trigger calls POST /jobs/:id/run', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

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

  it('runner_runs appends limit query param', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    );

    const execute = api.tools.get('runner_runs')!;
    await execute('test', { jobId: 'poll-email', limit: 5 });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/jobs/poll-email/runs?limit=5',
      undefined,
    );
  });

  it('runner_enable calls PATCH /jobs/:id/enable', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

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

  it('runner_disable calls PATCH /jobs/:id/disable', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const execute = api.tools.get('runner_disable')!;
    await execute('test', { jobId: 'my-job' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/jobs/my-job/disable',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('runner_create_job calls POST /jobs', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

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

    const callArgs = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(callArgs[1].body).toContain('"id":"new-job"');
  });

  it('runner_delete_job calls DELETE /jobs/:id', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

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
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    const stateData = { cursor: '12345', checkpoint: 'abc' };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(stateData), { status: 200 }),
    );

    const execute = api.tools.get('runner_query_state')!;
    const result = await execute('test', { namespace: 'poll-email' });

    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/state/poll-email',
      undefined,
    );
  });

  it('runner_query_state appends path query param', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: '12345', count: 1 }), {
        status: 200,
      }),
    );

    const execute = api.tools.get('runner_query_state')!;
    await execute('test', { namespace: 'poll-email', path: '$.cursor' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/state/poll-email?path=%24.cursor',
      undefined,
    );
  });

  it('runner_queue_peek calls GET /queues/:name/peek', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [{ id: 1, payload: { test: true }, priority: 0 }],
        }),
        { status: 200 },
      ),
    );

    const execute = api.tools.get('runner_queue_peek')!;
    const result = await execute('test', {
      queueName: 'email-updates',
      limit: 5,
    });

    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/queues/email-updates/peek?limit=5',
      undefined,
    );
  });

  it('returns connection error for new tools when service unreachable', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

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

  it('returns connection error when service unreachable', async () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    const connError = new TypeError('fetch failed');
    Object.defineProperty(connError, 'cause', {
      value: { code: 'ECONNREFUSED' },
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(connError);

    const execute = api.tools.get('runner_status')!;
    const result = await execute('test', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not reachable');
  });
});
