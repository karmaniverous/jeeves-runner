/**
 * @module plugin/runnerTools
 * Runner tool registrations (runner_* tools) for the OpenClaw plugin.
 */

import {
  connectionFail,
  fetchJson,
  ok,
  type PluginApi,
  postJson,
  type ToolResult,
} from './helpers.js';

/** Config for a runner API tool. */
interface ApiToolConfig {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Build the request: return [endpoint, body?]. No body = GET. */
  buildRequest: (params: Record<string, unknown>) => [string, unknown?];
}

/** Register a single API tool with standard try/catch + ok/connectionFail. */
function registerApiTool(
  api: PluginApi,
  baseUrl: string,
  config: ApiToolConfig,
): void {
  api.registerTool(
    {
      name: config.name,
      description: config.description,
      parameters: config.parameters,
      execute: async (
        _id: string,
        params: Record<string, unknown>,
      ): Promise<ToolResult> => {
        try {
          const [endpoint, body] = config.buildRequest(params);
          const url = `${baseUrl}${endpoint}`;
          const data =
            body !== undefined
              ? await postJson(url, body)
              : await fetchJson(url);
          return ok(data);
        } catch (error) {
          return connectionFail(error, baseUrl);
        }
      },
    },
    { optional: true },
  );
}

/** Register all 7 runner_* tools with the OpenClaw plugin API. */
export function registerRunnerTools(api: PluginApi, baseUrl: string): void {
  const tools: ApiToolConfig[] = [
    {
      name: 'runner_status',
      description:
        'Get jeeves-runner service health, uptime, job counts, and error statistics.',
      parameters: { type: 'object', properties: {} },
      buildRequest: () => ['/stats'],
    },
    {
      name: 'runner_jobs',
      description:
        'List all runner jobs with enabled state, schedule, last run status, and last run time.',
      parameters: { type: 'object', properties: {} },
      buildRequest: () => ['/jobs'],
    },
    {
      name: 'runner_trigger',
      description:
        'Manually trigger a runner job. Blocks until the job completes and returns the run result.',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The job ID to trigger.',
          },
        },
        required: ['jobId'],
      },
      buildRequest: (params) => [
        `/jobs/${encodeURIComponent(String(params.jobId))}/run`,
        {},
      ],
    },
    {
      name: 'runner_runs',
      description:
        'Get recent run history for a runner job, including status, duration, exit code, and error details.',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The job ID to get runs for.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of runs to return (default 50).',
          },
        },
        required: ['jobId'],
      },
      buildRequest: (params) => {
        const limit =
          params.limit !== undefined
            ? `?limit=${String(Number(params.limit))}`
            : '';
        return [
          `/jobs/${encodeURIComponent(String(params.jobId))}/runs${limit}`,
        ];
      },
    },
    {
      name: 'runner_job_detail',
      description:
        'Get full configuration details for a single runner job, including script path, schedule, timeout, and overlap policy.',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The job ID to get details for.',
          },
        },
        required: ['jobId'],
      },
      buildRequest: (params) => [
        `/jobs/${encodeURIComponent(String(params.jobId))}`,
      ],
    },
    {
      name: 'runner_enable',
      description: 'Enable a disabled runner job. Takes effect immediately.',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The job ID to enable.',
          },
        },
        required: ['jobId'],
      },
      buildRequest: (params) => [
        `/jobs/${encodeURIComponent(String(params.jobId))}/enable`,
        {},
      ],
    },
    {
      name: 'runner_disable',
      description:
        'Disable a runner job. The job will not run until re-enabled. Takes effect immediately.',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The job ID to disable.',
          },
        },
        required: ['jobId'],
      },
      buildRequest: (params) => [
        `/jobs/${encodeURIComponent(String(params.jobId))}/disable`,
        {},
      ],
    },
  ];

  for (const tool of tools) {
    registerApiTool(api, baseUrl, tool);
  }
}
