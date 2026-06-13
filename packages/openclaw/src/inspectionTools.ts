/**
 * Queue and state inspection tools for the OpenClaw plugin.
 *
 * @module inspectionTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import { catalogTool, registerApiTool } from './toolHelpers.js';

/** URL-encode a path segment for safe interpolation. */
function enc(value: unknown): string {
  return encodeURIComponent(String(value));
}

/** Register queue and state inspection tools. */
export function registerInspectionTools(api: PluginApi, baseUrl: string): void {
  const tools = [
    catalogTool(
      'listQueues',
      'runner_list_queues',
      {
        type: 'object',
        properties: {},
      },
      () => ['/queues'],
    ),

    catalogTool(
      'queueStatus',
      'runner_queue_status',
      {
        type: 'object',
        properties: {
          queueName: {
            type: 'string',
            description: 'Queue name to inspect.',
          },
        },
        required: ['queueName'],
      },
      (params) => [`/queues/${enc(params.queueName)}/status`],
    ),

    catalogTool(
      'queuePeek',
      'runner_queue_peek',
      {
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
      (params) => {
        const query =
          params.limit !== undefined
            ? `?limit=${String(Number(params.limit))}`
            : '';
        return [`/queues/${enc(params.queueName)}/peek${query}`];
      },
    ),

    catalogTool(
      'listNamespaces',
      'runner_list_namespaces',
      {
        type: 'object',
        properties: {},
      },
      () => ['/state'],
    ),

    catalogTool(
      'queryState',
      'runner_query_state',
      {
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
      (params) => {
        const query =
          params.path !== undefined ? `?path=${enc(params.path)}` : '';
        return [`/state/${enc(params.namespace)}${query}`];
      },
    ),

    catalogTool(
      'queryCollection',
      'runner_query_collection',
      {
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
      (params) => [`/state/${enc(params.namespace)}/${enc(params.key)}`],
    ),
  ];

  for (const tool of tools) {
    registerApiTool(api, baseUrl, tool);
  }
}
