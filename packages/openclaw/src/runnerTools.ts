/**
 * Runner tool registrations (runner_* tools) for the OpenClaw plugin.
 *
 * Orchestrates registration of all runner tools across sub-modules.
 *
 * @module runnerTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import { registerInspectionTools } from './inspectionTools.js';
import { registerManagementTools } from './managementTools.js';
import {
  type ApiToolConfig,
  JOB_ID_PARAM,
  jobPath,
  registerApiTool,
} from './toolHelpers.js';

/** Register all 17 runner_* tools with the OpenClaw plugin API. */
export function registerRunnerTools(api: PluginApi, baseUrl: string): void {
  const coreTools: ApiToolConfig[] = [
    {
      name: 'runner_status',
      description:
        'Job counts (total, running), failed registrations, ok/error counts last hour',
      parameters: { type: 'object', properties: {} },
      buildRequest: () => ['/status'],
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
      method: 'POST',
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
      method: 'PATCH',
      buildRequest: (params) => [jobPath(params, '/enable'), {}],
    },
    {
      name: 'runner_disable',
      description:
        'Disable a runner job. The job will not run until re-enabled. Takes effect immediately.',
      parameters: JOB_ID_PARAM,
      method: 'PATCH',
      buildRequest: (params) => [jobPath(params, '/disable'), {}],
    },
  ];

  for (const tool of coreTools) {
    registerApiTool(api, baseUrl, tool);
  }

  registerManagementTools(api, baseUrl);
  registerInspectionTools(api, baseUrl);
}
