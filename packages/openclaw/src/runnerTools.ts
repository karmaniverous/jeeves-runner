/**
 * Runner tool registrations (runner_* tools) for the OpenClaw plugin.
 *
 * @module runnerTools
 */

import {
  connectionFail,
  fetchJson,
  ok,
  type PluginApi,
  postJson,
  type ToolResult,
} from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';

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
          return connectionFail(error, baseUrl, PLUGIN_ID);
        }
      },
    },
    { optional: true },
  );
}

/** Shared parameter schema for tools that accept a jobId. */
const JOB_ID_PARAM = {
  type: 'object',
  properties: {
    jobId: { type: 'string', description: 'The job ID.' },
  },
  required: ['jobId'],
} as const;

/** URL-encode the jobId param for safe path interpolation. */
function jobPath(params: Record<string, unknown>, suffix = ''): string {
  return `/jobs/${encodeURIComponent(String(params.jobId))}${suffix}`;
}

/** Register all 7 runner_* tools with the OpenClaw plugin API. */
export function registerRunnerTools(api: PluginApi, baseUrl: string): void {
  const tools: ApiToolConfig[] = [
    {
      name: 'runner_status',
      description:
        'Job counts (total, running), failed registrations, ok/error counts last hour',
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
      parameters: JOB_ID_PARAM,
      buildRequest: (params) => [jobPath(params, '/run'), {}],
    },
    {
      name: 'runner_runs',
      description:
        'Get recent run history for a runner job, including status, duration, exit code, and error details.',
      parameters: {
        ...JOB_ID_PARAM,
        properties: {
          ...JOB_ID_PARAM.properties,
          limit: {
            type: 'number',
            description: 'Maximum number of runs to return (default 50).',
          },
        },
      },
      buildRequest: (params) => {
        const query =
          params.limit !== undefined
            ? `?limit=${String(Number(params.limit))}`
            : '';
        return [jobPath(params, `/runs${query}`)];
      },
    },
    {
      name: 'runner_job_detail',
      description:
        'Get full configuration details for a single runner job, including script path, schedule, timeout, and overlap policy.',
      parameters: JOB_ID_PARAM,
      buildRequest: (params) => [jobPath(params)],
    },
    {
      name: 'runner_enable',
      description: 'Enable a disabled runner job. Takes effect immediately.',
      parameters: JOB_ID_PARAM,
      buildRequest: (params) => [jobPath(params, '/enable'), {}],
    },
    {
      name: 'runner_disable',
      description:
        'Disable a runner job. The job will not run until re-enabled. Takes effect immediately.',
      parameters: JOB_ID_PARAM,
      buildRequest: (params) => [jobPath(params, '/disable'), {}],
    },
  ];

  for (const tool of tools) {
    registerApiTool(api, baseUrl, tool);
  }
}
