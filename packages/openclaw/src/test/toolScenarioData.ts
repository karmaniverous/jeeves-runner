/**
 * @module test/toolScenarioData
 * The plugin baseline's tool calls: one per runner tool with a schema-valid stub reply, plus the error replies (non-2xx, refused connection, non-JSON 2xx, timeout). Pure data.
 */

import type { StubReply, ToolScenario } from './toolScenarios.js';

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
