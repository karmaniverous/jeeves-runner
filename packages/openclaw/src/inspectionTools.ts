/**
 * Queue and state inspection tools for the OpenClaw plugin.
 *
 * @module inspectionTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import {
  type BaseUrl,
  NO_PARAMS,
  pick,
  registerRunnerTool,
  type RunnerToolConfig,
} from './toolHelpers.js';

/** Queue and state tools. */
const INSPECTION_TOOLS: readonly RunnerToolConfig[] = [
  {
    name: 'runner_list_queues',
    entry: 'listQueues',
    parameters: NO_PARAMS,
    toInput: () => ({}),
  },
  {
    name: 'runner_queue_status',
    entry: 'queueStatus',
    parameters: {
      type: 'object',
      properties: {
        queueName: {
          type: 'string',
          description: 'Queue name to inspect.',
        },
      },
      required: ['queueName'],
    },
    toInput: (params) => ({ name: params.queueName }),
  },
  {
    name: 'runner_queue_peek',
    entry: 'queuePeek',
    parameters: {
      type: 'object',
      properties: {
        queueName: {
          type: 'string',
          description: 'Queue name to peek.',
        },
        limit: {
          type: 'number',
          description: 'Maximum items to return (default 10).',
        },
      },
      required: ['queueName'],
    },
    toInput: (params) => ({
      name: params.queueName,
      ...pick(params, ['limit']),
    }),
  },
  {
    name: 'runner_list_namespaces',
    entry: 'listNamespaces',
    parameters: NO_PARAMS,
    toInput: () => ({}),
  },
  {
    name: 'runner_query_state',
    entry: 'queryState',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'State namespace to query.',
        },
        path: {
          type: 'string',
          description: 'Optional JSONPath expression to filter results.',
        },
      },
      required: ['namespace'],
    },
    toInput: (params) => pick(params, ['namespace', 'path']),
  },
  {
    name: 'runner_query_collection',
    entry: 'queryCollection',
    parameters: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'State namespace.',
        },
        key: {
          type: 'string',
          description: 'Collection key within the namespace.',
        },
      },
      required: ['namespace', 'key'],
    },
    toInput: (params) => pick(params, ['namespace', 'key']),
  },
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
  for (const tool of INSPECTION_TOOLS) registerRunnerTool(api, baseUrl, tool);
}
