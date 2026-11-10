/**
 * Shared types and helpers for the runner's own tools: each tool calls one SDK method (`@karmaniverous/jeeves-runner-sdk`, DD#91) and keeps the 0.12.0-0 name, description, parameters and result text.
 *
 * @module toolHelpers
 */

import {
  connectionFail,
  fail,
  ok,
  type PluginApi,
  type ToolResult,
} from '@karmaniverous/jeeves';
import { CatalogClientError } from '@karmaniverous/jeeves/catalog';
import {
  RUNNER_CATALOG,
  type RunnerEntryName,
} from '@karmaniverous/jeeves-runner-core';
import {
  type CallOptions,
  createRunnerClient,
  errorBodyText,
  isRunnerError,
  type RunnerError,
} from '@karmaniverous/jeeves-runner-sdk';

import { PLUGIN_ID } from './constants.js';

/** Base URL of the runner API, or a getter resolving it per call. */
export type BaseUrl = string | (() => string);

/** Config for a runner tool. */
export interface RunnerToolConfig {
  /** Tool name (unchanged since 0.12.0-0; renaming is #134). */
  name: string;
  /** Catalog entry the tool calls (its SDK method). */
  entry: RunnerEntryName;
  /** Tool parameters as JSON Schema (unchanged since 0.12.0-0). */
  parameters: Record<string, unknown>;
  /** Map tool parameters to the SDK method's input. */
  toInput: (params: Record<string, unknown>) => Record<string, unknown>;
  /** Timeout override for the call (default: the SDK's per-entry default). */
  timeoutMs?: number;
}

/**
 * What failed under the SDK when no usable response arrived: the error
 * `fetch` threw (its `cause` carries `ECONNREFUSED` etc.), the timeout abort
 * or the JSON parse error, so tool results read as they did with `fetchJson`.
 *
 * @param error - A status-0 or non-JSON RunnerError.
 * @returns The underlying error, or the RunnerError itself.
 */
function underlying(error: RunnerError): unknown {
  const inner =
    error.cause instanceof CatalogClientError ? error.cause.cause : error.cause;
  return inner ?? error;
}

/**
 * Tool result for a failed call, worded as the 0.12.0-0 tools worded it:
 * `Error: HTTP <status>: <body as received>` for a non-2xx response, the
 * connection guidance for an unreachable runner, `Error: <message>` for a
 * timeout, a non-JSON body or anything else.
 *
 * @param error - What the SDK call threw.
 * @param baseUrl - The runner URL the call used.
 * @returns The error result.
 */
export function toolError(error: unknown, baseUrl: string): ToolResult {
  if (!isRunnerError(error)) return fail(error);
  if (error.status >= 300) {
    return fail(
      new Error(`HTTP ${String(error.status)}: ${errorBodyText(error)}`),
    );
  }
  if (error.issues !== undefined) return fail(error);
  return connectionFail(underlying(error), baseUrl, PLUGIN_ID);
}

/**
 * Register one runner tool.
 *
 * @param api - Plugin API.
 * @param baseUrl - Runner URL, or a getter resolved on every call.
 * @param config - Tool name, entry, parameters, input mapping and timeout.
 */
export function registerRunnerTool(
  api: PluginApi,
  baseUrl: BaseUrl,
  config: RunnerToolConfig,
): void {
  const resolveUrl = typeof baseUrl === 'string' ? () => baseUrl : baseUrl;
  const call: CallOptions =
    config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs };
  api.registerTool(
    {
      name: config.name,
      description: RUNNER_CATALOG.byName(config.entry).description,
      parameters: config.parameters,
      execute: async (
        _id: string,
        params: Record<string, unknown>,
      ): Promise<ToolResult> => {
        const url = resolveUrl();
        try {
          const client = createRunnerClient({ baseUrl: url });
          const method = client[config.entry] as (
            input: unknown,
            options: CallOptions,
          ) => Promise<unknown>;
          return ok(await method(config.toInput(params), call));
        } catch (error) {
          return toolError(error, url);
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

/** No parameters. */
export const NO_PARAMS = { type: 'object', properties: {} } as const;

/**
 * SDK input `{ id }` from the `jobId` tool parameter.
 *
 * @param params - Tool parameters.
 * @returns The input.
 */
export const jobInput = (
  params: Record<string, unknown>,
): Record<string, unknown> => ({ id: params.jobId });

/**
 * Copy the defined parameters among `keys`.
 *
 * @param params - Tool parameters.
 * @param keys - Parameter names to copy.
 * @returns The defined ones.
 */
export function pick(
  params: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (params[key] !== undefined) out[key] = params[key];
  }
  return out;
}
