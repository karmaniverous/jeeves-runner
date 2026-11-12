/**
 * Shared helpers for the runner's own tools: each tool's definition comes from its catalog entry (`catalogToolDefinition`, DD#91), with the 0.12.0-0 tool and parameter names kept by aliases, and each call goes through one SDK method (`@karmaniverous/jeeves-runner-sdk`) with the 0.12.0-0 result text.
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
import {
  CatalogClientError,
  catalogToolDefinition,
} from '@karmaniverous/jeeves/catalog';
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
import { z } from 'zod';

import { PLUGIN_ID } from './constants.js';

/** Base URL of the runner API, or a getter resolving it per call. */
export type BaseUrl = string | (() => string);

/** Config for a runner tool. */
export interface RunnerToolConfig {
  /** Tool name (unchanged since 0.12.0-0; renaming is #134). */
  name: string;
  /** Catalog entry the tool calls (its SDK method). */
  entry: RunnerEntryName;
  /** Tool parameter names for entry fields (e.g. `{ id: 'jobId' }`). */
  aliases?: Readonly<Record<string, string>>;
  /** Timeout override for the call (default: the SDK's per-entry default). */
  timeoutMs?: number;
}

/** `:id` exposed as `jobId`, as in 0.12.0-0. */
export const JOB_ID_ALIAS = { id: 'jobId' } as const;

/**
 * The entry's request fields (params, query and body) as one object schema.
 *
 * @param entry - Entry name.
 * @returns The merged schema.
 */
function requestSchema(entry: RunnerEntryName): z.ZodObject {
  const e = RUNNER_CATALOG.byName(entry) as {
    params?: z.ZodObject;
    query?: z.ZodObject;
    body?: z.ZodObject;
  };
  return z.object({ ...e.params?.shape, ...e.query?.shape, ...e.body?.shape });
}

/**
 * Tool parameters for an entry: jeeves' `catalogToolDefinition` input schema
 * (parameter names aliased), with `required` taken from the input shape.
 *
 * @remarks
 * The definition is converted in Zod's output mode, which lists fields with
 * defaults (`createJob`'s `source_type`, `type`, `overlap_policy`,
 * `enabled`) as required; a caller may omit them, so `required` is the
 * input-mode list.
 *
 * @param entry - Entry name.
 * @param aliases - Tool parameter names for entry fields.
 * @returns JSON Schema of the tool parameters.
 */
export function toolParameters(
  entry: RunnerEntryName,
  aliases: Readonly<Record<string, string>> = {},
): Record<string, unknown> {
  const { inputSchema } = catalogToolDefinition(RUNNER_CATALOG.byName(entry), {
    prefix: 'runner',
    inputAliases: aliases,
  });
  const inputRequired =
    z.toJSONSchema(requestSchema(entry), { io: 'input' }).required ?? [];
  const { required: _outputRequired, ...rest } = inputSchema;
  return inputRequired.length === 0
    ? rest
    : { ...rest, required: inputRequired.map((f) => aliases[f] ?? f) };
}

/**
 * SDK input from tool parameters: each entry field read from its (aliased)
 * parameter; parameters that are not entry fields are dropped.
 *
 * @param entry - Entry name.
 * @param aliases - Tool parameter names for entry fields.
 * @param params - Tool parameters.
 * @returns The input.
 */
export function toolInput(
  entry: RunnerEntryName,
  aliases: Readonly<Record<string, string>>,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of Object.keys(requestSchema(entry).shape)) {
    const value = params[aliases[field] ?? field];
    if (value !== undefined) input[field] = value;
  }
  return input;
}

/**
 * What failed under the SDK when no usable response arrived: the error
 * `fetch` threw (its `cause` carries `ECONNREFUSED` etc.), the timeout abort
 * or the JSON parse error, so tool results read as they did in 0.12.0-0.
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
 * `Error: HTTP <status>: <body as received>` for a non-2xx response (the
 * watcher's catalog-tool text; since the runner's 0.14.0-1 error contract,
 * DD#96, that body is `{ statusCode, code?, error, message }`, so the text
 * carries the code and message), the connection guidance for an
 * unreachable runner, `Error: <message>` for a timeout, a non-JSON body or
 * anything else.
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
 * @param config - Tool name, entry, aliases and timeout.
 */
export function registerRunnerTool(
  api: PluginApi,
  baseUrl: BaseUrl,
  config: RunnerToolConfig,
): void {
  const resolveUrl = typeof baseUrl === 'string' ? () => baseUrl : baseUrl;
  const aliases = config.aliases ?? {};
  const call: CallOptions =
    config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs };
  api.registerTool(
    {
      name: config.name,
      description: RUNNER_CATALOG.byName(config.entry).description,
      parameters: toolParameters(config.entry, aliases),
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
          return ok(
            await method(toolInput(config.entry, aliases, params), call),
          );
        } catch (error) {
          return toolError(error, url);
        }
      },
    },
    { optional: true },
  );
}

/**
 * Register a list of runner tools.
 *
 * @param api - Plugin API.
 * @param baseUrl - Runner URL, or a getter resolved on every call.
 * @param tools - Tool configs.
 */
export function registerRunnerTools(
  api: PluginApi,
  baseUrl: BaseUrl,
  tools: readonly RunnerToolConfig[],
): void {
  for (const tool of tools) registerRunnerTool(api, baseUrl, tool);
}
