/**
 * Shared pieces of the runner's catalog handlers: their types, a wrapper turning synchronous (SQLite) handlers into the promise-returning handlers `registerCatalogRoutes` takes, the job-not-found result and JSONPath filtering. Pure.
 *
 * @module api/handler-utils
 */

import type { CatalogHandlers } from '@karmaniverous/jeeves/fastify';
import type { RunnerCatalog } from '@karmaniverous/jeeves-runner-core';
import { JSONPath } from 'jsonpath-plus';

/** One handler per runner catalog entry. */
export type RunnerHandlers = CatalogHandlers<RunnerCatalog>;

/** Name of a runner catalog entry. */
export type RunnerHandlerName = keyof RunnerHandlers;

/** A synchronous handler for entry `N`: same input, the result unwrapped. */
export type SyncHandler<N extends RunnerHandlerName> = (
  input: Parameters<RunnerHandlers[N]>[0],
) => Awaited<ReturnType<RunnerHandlers[N]>>;

/**
 * Wrap synchronous handlers as catalog handlers; a throw becomes a rejection
 * (the app's error handler answers it, as before).
 *
 * @param handlers - Synchronous handlers keyed by entry name.
 * @returns The same handlers, promise-returning.
 */
export function fromSync<K extends RunnerHandlerName>(handlers: {
  [N in K]: SyncHandler<N>;
}): Pick<RunnerHandlers, K> {
  const wrapped: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    const run = handler as (input: unknown) => unknown;
    wrapped[name] = (input: unknown) =>
      new Promise((resolve) => {
        resolve(run(input));
      });
  }
  return wrapped as Pick<RunnerHandlers, K>;
}

/** 404 for an unknown job id (body unchanged since 0.1). */
export const JOB_NOT_FOUND = {
  status: 404,
  body: { error: 'Job not found' },
} as const;

/** `{ ok: true }` with 200. */
export const OK = { status: 200, body: { ok: true } } as const;

/**
 * Apply an optional JSONPath to a body, as the state routes always have:
 * without `path` the body itself, else `{ result, count }`.
 *
 * @param body - The unfiltered body.
 * @param path - JSONPath expression (empty or absent: no filtering).
 * @returns The body or the JSONPath result.
 */
export function withJsonPath<B extends object>(
  body: B,
  path: string | undefined,
): B | { result: unknown[]; count: number } {
  if (!path) return body;
  // `wrap: true` (the default, explicit here): always an array, [] on no match.
  const result = JSONPath({ path, json: body, wrap: true }) as unknown[];
  return { result, count: result.length };
}
