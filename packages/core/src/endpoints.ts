/**
 * The original endpoint list of the jeeves-runner API (name, method, path,
 * description), superseded by `RUNNER_CATALOG` and kept for existing
 * consumers until a breaking core release (DD#86). A test holds the two in
 * step by name, method and path.
 *
 * @remarks
 * Only the deprecated aliases are exported, so the package entry re-exports
 * this module with `export *` (a named re-export of a deprecated symbol fails
 * `no-deprecated`); the list and its types are module-internal.
 *
 * @module endpoints
 */

import { ENDPOINT_DESCRIPTIONS } from './descriptions.js';

/** HTTP methods used by the API. */
type Method = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

/** Descriptor for a single API endpoint. */
interface Descriptor {
  /** Unique endpoint identifier (camelCase). */
  name: string;
  /** HTTP method. */
  method: Method;
  /** URL path pattern (e.g. '/jobs/:id'). */
  path: string;
  /** Human-readable description of the endpoint's purpose. */
  description: string;
}

/** The endpoint list. */
const ENDPOINTS = [
  {
    name: 'status',
    method: 'GET',
    path: '/status',
    description:
      'Unified status: version, uptime, total/running jobs, failed registrations, OK/error counts last hour',
  },
  {
    name: 'listJobs',
    method: 'GET',
    path: '/jobs',
    description: ENDPOINT_DESCRIPTIONS.listJobs,
  },
  {
    name: 'createJob',
    method: 'POST',
    path: '/jobs',
    description: ENDPOINT_DESCRIPTIONS.createJob,
  },
  {
    name: 'jobDetail',
    method: 'GET',
    path: '/jobs/:id',
    description: ENDPOINT_DESCRIPTIONS.jobDetail,
  },
  {
    name: 'updateJob',
    method: 'PATCH',
    path: '/jobs/:id',
    description: ENDPOINT_DESCRIPTIONS.updateJob,
  },
  {
    name: 'deleteJob',
    method: 'DELETE',
    path: '/jobs/:id',
    description: ENDPOINT_DESCRIPTIONS.deleteJob,
  },
  {
    name: 'enableJob',
    method: 'PATCH',
    path: '/jobs/:id/enable',
    description: ENDPOINT_DESCRIPTIONS.enableJob,
  },
  {
    name: 'disableJob',
    method: 'PATCH',
    path: '/jobs/:id/disable',
    description: ENDPOINT_DESCRIPTIONS.disableJob,
  },
  {
    name: 'updateScript',
    method: 'PUT',
    path: '/jobs/:id/script',
    description: ENDPOINT_DESCRIPTIONS.updateScript,
  },
  {
    name: 'triggerJob',
    method: 'POST',
    path: '/jobs/:id/run',
    description: ENDPOINT_DESCRIPTIONS.triggerJob,
  },
  {
    name: 'jobRuns',
    method: 'GET',
    path: '/jobs/:id/runs',
    description: ENDPOINT_DESCRIPTIONS.jobRuns,
  },
  {
    name: 'config',
    method: 'GET',
    path: '/config',
    description: 'Query effective configuration (optional JSONPath)',
  },
  {
    name: 'configApply',
    method: 'POST',
    path: '/config/apply',
    description:
      'Apply a config patch (validates, merges, writes, triggers reconciliation)',
  },
  {
    name: 'listQueues',
    method: 'GET',
    path: '/queues',
    description: ENDPOINT_DESCRIPTIONS.listQueues,
  },
  {
    name: 'queueStatus',
    method: 'GET',
    path: '/queues/:name/status',
    description: ENDPOINT_DESCRIPTIONS.queueStatus,
  },
  {
    name: 'queuePeek',
    method: 'GET',
    path: '/queues/:name/peek',
    description: ENDPOINT_DESCRIPTIONS.queuePeek,
  },
  {
    name: 'listNamespaces',
    method: 'GET',
    path: '/state',
    description: ENDPOINT_DESCRIPTIONS.listNamespaces,
  },
  {
    name: 'queryState',
    method: 'GET',
    path: '/state/:namespace',
    description: ENDPOINT_DESCRIPTIONS.queryState,
  },
  {
    name: 'queryCollection',
    method: 'GET',
    path: '/state/:namespace/:key',
    description: ENDPOINT_DESCRIPTIONS.queryCollection,
  },
] as const satisfies readonly Descriptor[];

/** Union of all endpoint names. */
type Name = (typeof ENDPOINTS)[number]['name'];

/** Single entry from the list, narrowed by name. */
type EndpointOf<N extends Name> = Extract<
  (typeof ENDPOINTS)[number],
  { name: N }
>;

/**
 * HTTP methods used by the API.
 *
 * @deprecated Use `RUNNER_CATALOG` entries (`CatalogEntry['method']`).
 */
export type HttpMethod = Method;

/**
 * Descriptor for a single API endpoint.
 *
 * @deprecated Use `RUNNER_CATALOG` entries, which add schemas, auth and kind.
 */
export type EndpointDescriptor = Descriptor;

/**
 * Canonical endpoint catalog for the jeeves-runner API.
 *
 * Every entry describes a single HTTP endpoint exposed by the service.
 *
 * @deprecated Use `RUNNER_CATALOG` (same names, methods and paths, plus
 *   request and response schemas). Removed in a future breaking core release.
 */
export const RUNNER_ENDPOINTS = ENDPOINTS;

/**
 * Union of all endpoint names.
 *
 * @deprecated Use `RunnerEntryName`.
 */
export type EndpointName = Name;

/**
 * Single entry from the catalog, narrowed by name.
 *
 * @deprecated Use `RunnerEntry<N>` or `RUNNER_CATALOG.byName(name)`.
 */
export type Endpoint<N extends Name> = EndpointOf<N>;

/**
 * Look up an endpoint descriptor by name.
 *
 * @param name - The endpoint identifier.
 * @returns The matching descriptor.
 * @throws Error when no endpoint has that name.
 * @deprecated Use `RUNNER_CATALOG.byName(name)`.
 */
export function getEndpoint<N extends Name>(name: N): EndpointOf<N> {
  const ep = ENDPOINTS.find((e) => e.name === name);
  if (!ep) throw new Error(`Unknown endpoint: ${name}`);
  return ep as EndpointOf<N>;
}
