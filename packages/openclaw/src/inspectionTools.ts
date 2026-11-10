/**
 * Queue and state inspection tools for the OpenClaw plugin.
 *
 * @module inspectionTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import {
  type BaseUrl,
  registerRunnerTools,
  type RunnerToolConfig,
} from './toolHelpers.js';

/** `:name` exposed as `queueName`, as in 0.12.0-0. */
const QUEUE_ALIAS = { name: 'queueName' } as const;

/** Queue and state tools. */
const INSPECTION_TOOLS: readonly RunnerToolConfig[] = [
  { name: 'runner_list_queues', entry: 'listQueues' },
  { name: 'runner_queue_status', entry: 'queueStatus', aliases: QUEUE_ALIAS },
  { name: 'runner_queue_peek', entry: 'queuePeek', aliases: QUEUE_ALIAS },
  { name: 'runner_list_namespaces', entry: 'listNamespaces' },
  { name: 'runner_query_state', entry: 'queryState' },
  { name: 'runner_query_collection', entry: 'queryCollection' },
];

/**
 * Register queue and state inspection tools.
 *
 * @param api - Plugin API.
 * @param baseUrl - Runner URL, or a getter resolved on every call.
 */
export function registerInspectionTools(
  api: PluginApi,
  baseUrl: BaseUrl,
): void {
  registerRunnerTools(api, baseUrl, INSPECTION_TOOLS);
}
