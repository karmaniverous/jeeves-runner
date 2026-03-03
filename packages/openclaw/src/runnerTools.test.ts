/**
 * Tests for runner tool registrations.
 */

import { describe, expect, it, vi } from 'vitest';

import type { PluginApi, ToolResult } from './helpers.js';
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
  it('registers all 7 tools', () => {
    const api = createMockApi();
    registerRunnerTools(api, 'http://localhost:1937');

    expect(api.tools.size).toBe(7);
    expect(api.tools.has('runner_status')).toBe(true);
    expect(api.tools.has('runner_jobs')).toBe(true);
    expect(api.tools.has('runner_trigger')).toBe(true);
    expect(api.tools.has('runner_runs')).toBe(true);
    expect(api.tools.has('runner_job_detail')).toBe(true);
    expect(api.tools.has('runner_enable')).toBe(true);
    expect(api.tools.has('runner_disable')).toBe(true);
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
