/**
 * Queue and state inspection tools for the OpenClaw plugin.
 *
 * @module inspectionTools
 */

import type { PluginApi } from '@karmaniverous/jeeves';

import { type ApiToolConfig, registerApiTool } from './toolHelpers.js';

/** URL-encode a path segment for safe interpolation. */
function enc(value: unknown): string {
  return encodeURIComponent(String(value));
}

/** Register queue and state inspection tools. */
export function registerInspectionTools(api: PluginApi, baseUrl: string): void {
  const tools: ApiToolConfig[] = [
    {
      name: 'runner_list_queues',
      description: 'List all queues that have items.',
      parameters: { type: 'object', properties: {} },
      buildRequest: () => ['/queues'],
    },
    {
      name: 'runner_queue_status',
      description:
        'Get queue depth, claimed count, failed count, and oldest item age.',
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
      buildRequest: (params) => [`/queues/${enc(params.queueName)}/status`],
    },
    {
      name: 'runner_queue_peek',
      description:
        'Non-claiming read of pending queue items (does not consume them).',
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
      buildRequest: (params) => {
        const query =
          params.limit !== undefined
            ? `?limit=${String(Number(params.limit))}`
            : '';
        return [`/queues/${enc(params.queueName)}/peek${query}`];
      },
    },
    {
      name: 'runner_list_namespaces',
      description: 'List all state namespaces.',
      parameters: { type: 'object', properties: {} },
      buildRequest: () => ['/state'],
    },
    {
      name: 'runner_query_state',
      description:
        'Read all scalar state for a namespace. Supports optional JSONPath filtering.',
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
      buildRequest: (params) => {
        const query =
          params.path !== undefined ? `?path=${enc(params.path)}` : '';
        return [`/state/${enc(params.namespace)}${query}`];
      },
    },
    {
      name: 'runner_query_collection',
      description: 'Read collection items for a state key within a namespace.',
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
      buildRequest: (params) => [
        `/state/${enc(params.namespace)}/${enc(params.key)}`,
      ],
    },
  ];

  for (const tool of tools) {
    registerApiTool(api, baseUrl, tool);
  }
}
