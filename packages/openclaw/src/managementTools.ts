/**
 * Job management tools: create, update, delete, and script update.
 *
 * @module managementTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import {
  type ApiToolConfig,
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
  const tools: ApiToolConfig[] = [
    {
      name: 'runner_create_job',
      description:
        'Create a new runner job. Requires id, name, schedule, and script.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique job identifier.' },
          ...JOB_MUTABLE_FIELDS,
        },
        required: ['id', 'name', 'schedule', 'script'],
      },
      method: 'POST',
      buildRequest: (params) => {
        const body = { id: params.id, ...buildJobBody(params) };
        return ['/jobs', body];
      },
    },
    {
      name: 'runner_update_job',
      description:
        'Update an existing runner job. Only supplied fields are changed.',
      parameters: {
        type: 'object',
        properties: {
          ...JOB_ID_PARAM.properties,
          ...JOB_MUTABLE_FIELDS,
        },
        required: ['jobId'],
      },
      method: 'PATCH',
      buildRequest: (params) => [jobPath(params), buildJobBody(params)],
    },
    {
      name: 'runner_delete_job',
      description: 'Delete a runner job and all its run history. Irreversible.',
      parameters: JOB_ID_PARAM,
      method: 'DELETE',
      buildRequest: (params) => [jobPath(params)],
    },
    {
      name: 'runner_update_script',
      description:
        "Update a job's script content or path without changing other fields.",
      parameters: {
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
      method: 'PUT',
      buildRequest: (params) => {
        const body: Record<string, unknown> = { script: params.script };
        if (params.source_type !== undefined) {
          body.source_type = params.source_type;
        }
        return [jobPath(params, '/script'), body];
      },
    },
  ];

  for (const tool of tools) {
    registerApiTool(api, baseUrl, tool);
  }
}
