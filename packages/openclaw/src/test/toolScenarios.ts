/**
 * @module test/toolScenarios
 * Tool scenarios for the plugin baseline (spec 4B.5 B7): one call per runner tool with a schema-valid stub reply, plus the error replies (non-2xx, refused connection, non-JSON 2xx, timeout), and a runner that records what each call sent and returned. Shared by the recorder and the baseline test; no assertions.
 */

import type { PluginApi, ToolResult } from '@karmaniverous/jeeves';
import { vi } from 'vitest';

import { registerRunnerCustomTools } from '../runnerTools.js';

/** Base URL the tools are registered with. */
export const BASE_URL = 'http://localhost:1937';

/** What a stub fetch does. */
export type StubReply =
  { status: number; body: string } | { reject: 'refused' | 'timeout' };

/** One tool call. */
export interface ToolScenario {
  /** Fixture key. */
  name: string;
  /** Tool name. */
  tool: string;
  /** Tool parameters. */
  params: Record<string, unknown>;
  /** Stub reply. */
  reply: StubReply;
}

/** What one call sent and returned. */
export interface ToolRecord {
  /** Requests sent (URL, method, JSON body). */
  requests: { url: string; method: string; body?: unknown }[];
  /** The tool result. */
  result: ToolResult;
}

/** A registered tool's definition. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
}

const json = (body: unknown, status = 200): StubReply => ({
  status,
  body: JSON.stringify(body),
});

const JOB_ROW = {
  id: 'a',
  name: 'A',
  schedule: '0 * * * *',
  script: '/s.js',
  type: 'script',
  description: null,
  enabled: 1,
  timeout_ms: null,
  overlap_policy: 'skip',
  on_failure: null,
  on_success: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  source_type: 'path',
  output_channel: null,
  env: null,
  args: null,
};

const RESULT = {
  status: 'ok',
  exitCode: 0,
  durationMs: 5,
  tokens: null,
  resultMeta: null,
  stdoutTail: 'out',
  stderrTail: '',
  error: null,
};

const OK = json({ ok: true });

/** Every scenario, in run order. */
export const TOOL_SCENARIOS: readonly ToolScenario[] = [
  {
    name: 'jobs',
    tool: 'runner_jobs',
    params: {},
    reply: json({ jobs: [{ ...JOB_ROW, last_status: 'ok', last_run: null }] }),
  },
  {
    name: 'trigger',
    tool: 'runner_trigger',
    params: { jobId: 'a/b' },
    reply: json({ result: RESULT }),
  },
  {
    name: 'trigger 404',
    tool: 'runner_trigger',
    params: { jobId: 'nope' },
    reply: json({ error: 'Job not found: nope' }, 404),
  },
  {
    name: 'trigger 409',
    tool: 'runner_trigger',
    params: { jobId: 'a' },
    reply: json({ error: 'Max concurrency reached' }, 409),
  },
  {
    name: 'trigger 500 Fastify default body',
    tool: 'runner_trigger',
    params: { jobId: 'a' },
    reply: json(
      {
        statusCode: 500,
        code: 'ERR_X',
        error: 'Internal Server Error',
        message: 'boom',
      },
      500,
    ),
  },
  {
    name: 'trigger 502 non-JSON body',
    tool: 'runner_trigger',
    params: { jobId: 'a' },
    reply: { status: 502, body: 'Bad gateway' },
  },
  {
    name: 'trigger refused',
    tool: 'runner_trigger',
    params: { jobId: 'a' },
    reply: { reject: 'refused' },
  },
  {
    name: 'trigger timeout',
    tool: 'runner_trigger',
    params: { jobId: 'a' },
    reply: { reject: 'timeout' },
  },
  {
    name: 'jobs non-JSON 2xx',
    tool: 'runner_jobs',
    params: {},
    reply: { status: 200, body: 'not json' },
  },
  {
    name: 'runs',
    tool: 'runner_runs',
    params: { jobId: 'a', limit: 5 },
    reply: json({ runs: [] }),
  },
  {
    name: 'runs no limit',
    tool: 'runner_runs',
    params: { jobId: 'a' },
    reply: json({ runs: [] }),
  },
  {
    name: 'job detail',
    tool: 'runner_job_detail',
    params: { jobId: 'a' },
    reply: json({ job: JOB_ROW }),
  },
  {
    name: 'job detail 404',
    tool: 'runner_job_detail',
    params: { jobId: 'nope' },
    reply: json({ error: 'Job not found' }, 404),
  },
  {
    name: 'enable',
    tool: 'runner_enable',
    params: { jobId: 'a' },
    reply: OK,
  },
  {
    name: 'disable',
    tool: 'runner_disable',
    params: { jobId: 'a' },
    reply: OK,
  },
  {
    name: 'create job',
    tool: 'runner_create_job',
    params: {
      id: 'n',
      name: 'N',
      schedule: '* * * * *',
      script: '/n.js',
      source_type: 'inline',
      timeout_seconds: 30,
      enabled: false,
      env: { A: '1' },
      args: ['--x'],
    },
    reply: json({ ok: true, id: 'n' }, 201),
  },
  {
    name: 'create job bad schedule',
    tool: 'runner_create_job',
    params: { id: 'n', name: 'N', schedule: 'nope', script: '/n.js' },
    reply: json({ error: 'Invalid schedule' }, 400),
  },
  {
    name: 'update job',
    tool: 'runner_update_job',
    params: { jobId: 'a', name: 'Renamed', on_success: 'C1' },
    reply: OK,
  },
  {
    name: 'delete job',
    tool: 'runner_delete_job',
    params: { jobId: 'a' },
    reply: OK,
  },
  {
    name: 'update script',
    tool: 'runner_update_script',
    params: { jobId: 'a', script: 'x', source_type: 'inline' },
    reply: OK,
  },
  {
    name: 'update script path only',
    tool: 'runner_update_script',
    params: { jobId: 'a', script: '/y.js' },
    reply: OK,
  },
  {
    name: 'list queues',
    tool: 'runner_list_queues',
    params: {},
    reply: json({ queues: ['q'] }),
  },
  {
    name: 'queue status',
    tool: 'runner_queue_status',
    params: { queueName: 'q/1' },
    reply: json({ depth: 1, claimedCount: 0, failedCount: 0, oldestAge: 5 }),
  },
  {
    name: 'queue peek',
    tool: 'runner_queue_peek',
    params: { queueName: 'q', limit: 2 },
    reply: json({
      items: [{ id: 1, payload: { n: 1 }, priority: 0, createdAt: 'x' }],
    }),
  },
  {
    name: 'list namespaces',
    tool: 'runner_list_namespaces',
    params: {},
    reply: json({ namespaces: ['ns'] }),
  },
  {
    name: 'query state',
    tool: 'runner_query_state',
    params: { namespace: 'ns' },
    reply: json({ cursor: '1', gone: null }),
  },
  {
    name: 'query state path',
    tool: 'runner_query_state',
    params: { namespace: 'n s', path: '$.cursor' },
    reply: json({ result: ['1'], count: 1 }),
  },
  {
    name: 'query collection',
    tool: 'runner_query_collection',
    params: { namespace: 'ns', key: 'k' },
    reply: json({
      value: null,
      items: [{ itemKey: 'i', value: 'v', updatedAt: 'x' }],
      count: 1,
    }),
  },
];

/** Mock plugin API that keeps registered tools. */
export function createToolApi() {
  const tools = new Map<
    string,
    ToolDefinition & {
      execute: (
        id: string,
        params: Record<string, unknown>,
      ) => Promise<ToolResult>;
    }
  >();
  const api: PluginApi = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  };
  registerRunnerCustomTools(api, BASE_URL);
  return tools;
}

/**
 * Definitions of the registered tools, in registration order.
 *
 * @returns Name, description and parameters of each tool.
 */
export function toolDefinitions(): ToolDefinition[] {
  return [...createToolApi().values()].map(
    ({ name, description, parameters }) => ({ name, description, parameters }),
  );
}

/**
 * Stub `fetch` for one reply, recording requests.
 *
 * @param reply - What to answer.
 * @param requests - Where to record requests.
 */
function stubFetch(reply: StubReply, requests: ToolRecord['requests']): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    requests.push({
      url,
      method: init?.method ?? 'GET',
      ...(body === undefined ? {} : { body }),
    });
    if ('reject' in reply) {
      return Promise.reject(
        reply.reject === 'refused'
          ? new TypeError('fetch failed', {
              cause: Object.assign(new Error('connect ECONNREFUSED'), {
                code: 'ECONNREFUSED',
              }),
            })
          : new DOMException(
              'The operation was aborted due to timeout',
              'TimeoutError',
            ),
      );
    }
    return Promise.resolve(
      new Response(reply.body, {
        status: reply.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );
  });
}

/**
 * Run one scenario and record what was sent and returned.
 *
 * @param scenario - The scenario.
 * @returns The record.
 */
export async function runToolScenario(
  scenario: ToolScenario,
): Promise<ToolRecord> {
  const tool = createToolApi().get(scenario.tool);
  if (!tool) throw new Error(`No tool ${scenario.tool}`);
  const requests: ToolRecord['requests'] = [];
  stubFetch(scenario.reply, requests);
  try {
    const result = await tool.execute('call', scenario.params);
    return { requests, result };
  } finally {
    vi.restoreAllMocks();
  }
}
