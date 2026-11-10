/**
 * The runner catalog's queue and state inspection entries (spec 4B.2 entries 14-19), in catalog order. JSONPath responses are a strict `{ result, count }` listed before the open body, so a state map is never read as one. Pure.
 *
 * @module catalog/inspectEntries
 */

import { z } from 'zod';

import { limitQuery, pathQuery, route } from './route.js';
import {
  collectionBodySchema,
  jsonPathResultSchema,
  queuePeekItemSchema,
  queueStatusSchema,
} from './rows.js';

/** The queue and state entries. */
export const INSPECT_ENTRIES = [
  {
    ...route('listQueues', 'GET', '/queues'),
    // queue_id is a nullable column (added by a migration).
    response: z.object({ queues: z.array(z.string().nullable()) }),
    kind: 'read',
  },
  {
    ...route('queueStatus', 'GET', '/queues/:name/status'),
    params: z.object({
      /** Queue name. */
      name: z.string().describe('Queue name to inspect.'),
    }),
    response: queueStatusSchema,
    kind: 'read',
  },
  {
    ...route('queuePeek', 'GET', '/queues/:name/peek'),
    params: z.object({
      /** Queue name. */
      name: z.string().describe('Queue name to peek.'),
    }),
    query: z.object({
      /** Maximum items (default 10). */
      limit: limitQuery('Maximum items to return (default 10).'),
    }),
    response: z.object({ items: z.array(queuePeekItemSchema) }),
    kind: 'read',
  },
  {
    ...route('listNamespaces', 'GET', '/state'),
    response: z.object({ namespaces: z.array(z.string()) }),
    kind: 'read',
  },
  {
    ...route('queryState', 'GET', '/state/:namespace'),
    params: z.object({
      /** State namespace. */
      namespace: z.string().describe('State namespace to query.'),
    }),
    query: z.object({
      /** JSONPath over the namespace's key-value map. */
      path: pathQuery(),
    }),
    response: z.union([
      jsonPathResultSchema,
      z.record(z.string(), z.string().nullable()),
    ]),
    kind: 'read',
  },
  {
    ...route('queryCollection', 'GET', '/state/:namespace/:key'),
    params: z.object({
      /** State namespace. */
      namespace: z.string().describe('State namespace.'),
      /** Collection key. */
      key: z.string().describe('Collection key within the namespace.'),
    }),
    query: z.object({
      /** Maximum items (default 100). */
      limit: limitQuery('Maximum items to return (default 100).'),
      /** Sort order by last update. */
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .describe('Sort by last update: "asc" or "desc" (default).'),
      /** JSONPath over the collection body. */
      path: pathQuery(),
    }),
    response: z.union([jsonPathResultSchema, collectionBodySchema]),
    kind: 'read',
  },
] as const;
