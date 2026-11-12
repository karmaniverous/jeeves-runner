/**
 * Shared parts of the runner catalog entries: the `route` helper giving an entry its name, method, path, description (from `ENDPOINT_DESCRIPTIONS`) and auth (`none`: the runner has no auth), and the params and query schemas several entries share. Pure.
 *
 * @module catalog/route
 */

import { z } from 'zod';

import { ENDPOINT_DESCRIPTIONS } from '../descriptions.js';

/** The runner's endpoint names (other than the three standard ones). */
export type RunnerRouteName = keyof typeof ENDPOINT_DESCRIPTIONS;

/**
 * Name, method, path, description and auth of a runner entry.
 *
 * @param name - Entry name (also the SDK method and OpenAPI `operationId`).
 * @param method - HTTP method.
 * @param path - Route path.
 * @returns The entry's identity fields.
 */
export function route<
  const N extends RunnerRouteName,
  const M extends 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
  const P extends string,
>(name: N, method: M, path: P) {
  return {
    name,
    method,
    path,
    description: ENDPOINT_DESCRIPTIONS[name],
    auth: 'none',
  } as const;
}

/** `:id` of a job route. */
export const jobIdParamsSchema = z.object({
  /** The job ID. */
  id: z.string().describe('The job ID.'),
});

/**
 * An optional positive integer `limit` query field. Positive, so an empty
 * `limit=` (coerced to 0) is refused with the uniform 400 rather than read as
 * "no rows" (it was a 500 before; DD#87 item a).
 *
 * @param description - Field description (names the default).
 * @returns The schema.
 */
export const limitQuery = (description: string) =>
  z.coerce.number().int().positive().optional().describe(description);

/** An optional JSONPath `path` query field. */
export const pathQuery = () =>
  z
    .string()
    .optional()
    .describe('Optional JSONPath expression to filter results.');
