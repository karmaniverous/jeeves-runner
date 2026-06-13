/**
 * Runner tool registrations (runner_* tools) for the OpenClaw plugin.
 *
 * Orchestrates registration of custom runner tools across sub-modules.
 * Standard tools (status, config, config_apply, service) are produced
 * by `createPluginToolset()` and registered separately.
 *
 * @module runnerTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import { registerInspectionTools } from './inspectionTools.js';
import { registerManagementTools } from './managementTools.js';
import {
  catalogTool,
  JOB_ID_PARAM,
  jobPath,
  registerApiTool,
} from './toolHelpers.js';

/** Register the 16 custom runner_* tools (excludes runner_status). */
export function registerRunnerCustomTools(
  api: PluginApi,
  baseUrl: string,
): void {
  const coreTools = [
    catalogTool(
      'listJobs',
      'runner_jobs',
      {
        type: 'object',
        properties: {},
      },
      () => ['/jobs'],
    ),

    catalogTool('triggerJob', 'runner_trigger', JOB_ID_PARAM, (params) => [
      jobPath(params, '/run'),
      {},
    ]),

    catalogTool(
      'jobRuns',
      'runner_runs',
      {
        ...JOB_ID_PARAM,
        properties: {
          ...JOB_ID_PARAM.properties,
          limit: {
            type: 'number',
            description: 'Maximum number of runs to return (default 50).',
          },
        },
      },
      (params) => {
        const query =
          params.limit !== undefined
            ? `?limit=${String(Number(params.limit))}`
            : '';
        return [jobPath(params, `/runs${query}`)];
      },
    ),

    catalogTool('jobDetail', 'runner_job_detail', JOB_ID_PARAM, (params) => [
      jobPath(params),
    ]),

    catalogTool('enableJob', 'runner_enable', JOB_ID_PARAM, (params) => [
      jobPath(params, '/enable'),
      {},
    ]),

    catalogTool('disableJob', 'runner_disable', JOB_ID_PARAM, (params) => [
      jobPath(params, '/disable'),
      {},
    ]),
  ];

  for (const tool of coreTools) {
    registerApiTool(api, baseUrl, tool);
  }

  registerManagementTools(api, baseUrl);
  registerInspectionTools(api, baseUrl);
}
