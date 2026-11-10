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
import { TRIGGER_TIMEOUT_MS } from '@karmaniverous/jeeves-runner-sdk';

import { registerInspectionTools } from './inspectionTools.js';
import { registerManagementTools } from './managementTools.js';
import {
  type BaseUrl,
  JOB_ID_ALIAS,
  registerRunnerTools,
  type RunnerToolConfig,
} from './toolHelpers.js';

/**
 * Client timeout for `runner_trigger` (the SDK's `triggerJob` default, 30
 * minutes, DD#79). `POST /jobs/:id/run` answers only when the job finishes;
 * the job itself keeps its own timeout.
 */
export { TRIGGER_TIMEOUT_MS };

/** Job listing, trigger, runs, detail, enable and disable tools. */
const CORE_TOOLS: readonly RunnerToolConfig[] = [
  { name: 'runner_jobs', entry: 'listJobs' },
  {
    name: 'runner_trigger',
    entry: 'triggerJob',
    aliases: JOB_ID_ALIAS,
    timeoutMs: TRIGGER_TIMEOUT_MS,
  },
  { name: 'runner_runs', entry: 'jobRuns', aliases: JOB_ID_ALIAS },
  { name: 'runner_job_detail', entry: 'jobDetail', aliases: JOB_ID_ALIAS },
  { name: 'runner_enable', entry: 'enableJob', aliases: JOB_ID_ALIAS },
  { name: 'runner_disable', entry: 'disableJob', aliases: JOB_ID_ALIAS },
];

/**
 * Register the 16 custom runner_* tools (excludes runner_status).
 *
 * @param api - Plugin API.
 * @param baseUrl - Runner URL, or a getter resolved on every call.
 */
export function registerRunnerCustomTools(
  api: PluginApi,
  baseUrl: BaseUrl,
): void {
  registerRunnerTools(api, baseUrl, CORE_TOOLS);
  registerManagementTools(api, baseUrl);
  registerInspectionTools(api, baseUrl);
}
