/**
 * Job management tools: create, update, delete, and script update.
 *
 * @module managementTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import {
  type BaseUrl,
  JOB_ID_PARAM,
  jobInput,
  pick,
  registerRunnerTool,
  type RunnerToolConfig,
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

/** Names of the mutable job fields. */
const MUTABLE_KEYS = Object.keys(JOB_MUTABLE_FIELDS);

/** Create, update, delete and script update tools. */
const MANAGEMENT_TOOLS: readonly RunnerToolConfig[] = [
  {
    name: 'runner_create_job',
    entry: 'createJob',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique job identifier.' },
        ...JOB_MUTABLE_FIELDS,
      },
      required: ['id', 'name', 'schedule', 'script'],
    },
    toInput: (params) => ({ id: params.id, ...pick(params, MUTABLE_KEYS) }),
  },
  {
    name: 'runner_update_job',
    entry: 'updateJob',
    parameters: {
      type: 'object',
      properties: {
        ...JOB_ID_PARAM.properties,
        ...JOB_MUTABLE_FIELDS,
      },
      required: ['jobId'],
    },
    toInput: (params) => ({
      ...jobInput(params),
      ...pick(params, MUTABLE_KEYS),
    }),
  },
  {
    name: 'runner_delete_job',
    entry: 'deleteJob',
    parameters: JOB_ID_PARAM,
    toInput: jobInput,
  },
  {
    name: 'runner_update_script',
    entry: 'updateScript',
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
    toInput: (params) => ({
      ...jobInput(params),
      ...pick(params, ['script', 'source_type']),
    }),
  },
];

/**
 * Register job management tools (create, update, delete, update_script).
 *
 * @param api - Plugin API.
 * @param baseUrl - Runner URL, or a getter resolved on every call.
 */
export function registerManagementTools(
  api: PluginApi,
  baseUrl: BaseUrl,
): void {
  for (const tool of MANAGEMENT_TOOLS) registerRunnerTool(api, baseUrl, tool);
}
