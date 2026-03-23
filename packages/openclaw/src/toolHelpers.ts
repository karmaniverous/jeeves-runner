/**
 * Shared types and helpers for runner tool registration.
 *
 * @module toolHelpers
 */

import {
  connectionFail,
  fetchJson,
  ok,
  type PluginApi,
  type ToolResult,
} from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';

/** Config for a runner API tool. */
export interface ApiToolConfig {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** HTTP method override. Defaults to GET (no body) or POST (with body). */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Build the request: return [endpoint, body?]. No body = GET. */
  buildRequest: (params: Record<string, unknown>) => [string, unknown?];
}

/** Register a single API tool with standard try/catch + ok/connectionFail. */
export function registerApiTool(
  api: PluginApi,
  baseUrl: string,
  config: ApiToolConfig,
): void {
  api.registerTool(
    {
      name: config.name,
      description: config.description,
      parameters: config.parameters,
      execute: async (
        _id: string,
        params: Record<string, unknown>,
      ): Promise<ToolResult> => {
        try {
          const [endpoint, body] = config.buildRequest(params);
          const url = `${baseUrl}${endpoint}`;
          const method = config.method;

          const init: RequestInit | undefined =
            method && method !== 'GET'
              ? {
                  method,
                  ...(body !== undefined
                    ? {
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      }
                    : {}),
                }
              : undefined;

          const data = await fetchJson(url, init);
          return ok(data);
        } catch (error) {
          return connectionFail(error, baseUrl, PLUGIN_ID);
        }
      },
    },
    { optional: true },
  );
}

/** Shared parameter schema for tools that accept a jobId. */
export const JOB_ID_PARAM = {
  type: 'object',
  properties: {
    jobId: { type: 'string', description: 'The job ID.' },
  },
  required: ['jobId'],
} as const;

/** URL-encode the jobId param for safe path interpolation. */
export function jobPath(params: Record<string, unknown>, suffix = ''): string {
  return `/jobs/${encodeURIComponent(String(params.jobId))}${suffix}`;
}
