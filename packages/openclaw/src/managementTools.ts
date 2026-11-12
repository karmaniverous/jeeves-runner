/**
 * Job management tools: create, update, delete, and script update.
 *
 * @module managementTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import {
  type BaseUrl,
  JOB_ID_ALIAS,
  registerRunnerTools,
  type RunnerToolConfig,
} from './toolHelpers.js';

/** Create, update, delete and script update tools. */
const MANAGEMENT_TOOLS: readonly RunnerToolConfig[] = [
  // createJob's body field `id` keeps its name.
  { name: 'runner_create_job', entry: 'createJob' },
  { name: 'runner_update_job', entry: 'updateJob', aliases: JOB_ID_ALIAS },
  { name: 'runner_delete_job', entry: 'deleteJob', aliases: JOB_ID_ALIAS },
  {
    name: 'runner_update_script',
    entry: 'updateScript',
    aliases: JOB_ID_ALIAS,
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
  registerRunnerTools(api, baseUrl, MANAGEMENT_TOOLS);
}
