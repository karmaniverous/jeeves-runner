/**
 * Job management tools: create, update, delete, and script update.
 *
 * @module managementTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import {
  catalogTool,
  JOB_ID_PARAM,
  jobPath,
  registerApiTool,
} from './toolHelpers.js';

/** Shared mutable-field properties for create/update job schemas. */
const JOB_MUTABLE_FIELDS = {
  name: { type: 'string', description: 'Human-readable job name.' },
  schedule: {
    type: 'string',
    description: 'Cron or rrstack schedule expression.',
  },
  script: {
    type: 'string',
    description: 'Script path (source_type=path) or inline script content.',
  },
  source_type: {
    type: 'string',
    description: 'Script source: "path" (default) or "inline".',
  },
  type: {
    type: 'string',
    description: 'Job type: "script" (default) or "session".',
  },
  timeout_seconds: {
    type: 'number',
    description: 'Kill the job after this many seconds.',
  },
  overlap_policy: {
    type: 'string',
    description: '"skip" (default) or "allow" concurrent runs.',
  },
  enabled: { type: 'boolean', description: 'Whether the job is enabled.' },
  description: { type: 'string', description: 'Job description.' },
  on_failure: {
    type: 'string',
    description: 'Slack channel ID for failure alerts.',
  },
  on_success: {
    type: 'string',
    description: 'Slack channel ID for success alerts.',
  },
  output_channel: {
    type: 'string',
    description: 'Slack channel ID for stdout relay.',
  },
  env: {
    type: 'object',
    description:
      'Environment variables for script-type jobs. Record<string, string> spread into spawn env alongside JR_* vars. Ignored for session jobs.',
  },
  args: {
    type: 'array',
    description:
      'Arguments for script-type jobs. String array appended after the script path in spawn. Ignored for session jobs.',
    items: { type: 'string' },
  },
} as const;

/** Build the request body from params, stripping undefined values. */
function buildJobBody(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(JOB_MUTABLE_FIELDS)) {
    if (params[key] !== undefined) {
      body[key] = params[key];
    }
  }
  return body;
}

/** Register job management tools (create, update, delete, update_script). */
export function registerManagementTools(api: PluginApi, baseUrl: string): void {
  const tools = [
    catalogTool(
      'createJob',
      'runner_create_job',
      {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique job identifier.' },
          ...JOB_MUTABLE_FIELDS,
        },
        required: ['id', 'name', 'schedule', 'script'],
      },
      (params) => {
        const body = { id: params.id, ...buildJobBody(params) };
        return ['/jobs', body];
      },
    ),

    catalogTool(
      'updateJob',
      'runner_update_job',
      {
        type: 'object',
        properties: {
          ...JOB_ID_PARAM.properties,
          ...JOB_MUTABLE_FIELDS,
        },
        required: ['jobId'],
      },
      (params) => [jobPath(params), buildJobBody(params)],
    ),

    catalogTool('deleteJob', 'runner_delete_job', JOB_ID_PARAM, (params) => [
      jobPath(params),
    ]),

    catalogTool(
      'updateScript',
      'runner_update_script',
      {
        type: 'object',
        properties: {
          ...JOB_ID_PARAM.properties,
          script: {
            type: 'string',
            description: 'New script path or inline content.',
          },
          source_type: {
            type: 'string',
            description: 'Script source: "path" or "inline".',
          },
        },
        required: ['jobId', 'script'],
      },
      (params) => {
        const body: Record<string, unknown> = { script: params.script };
        if (params.source_type !== undefined) {
          body.source_type = params.source_type;
        }
        return [jobPath(params, '/script'), body];
      },
    ),
  ];

  for (const tool of tools) {
    registerApiTool(api, baseUrl, tool);
  }
}
