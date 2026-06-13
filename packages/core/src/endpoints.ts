/**
 * Shared endpoint catalog — single source of truth for the jeeves-runner API.
 *
 * Both the CLI service and the OpenClaw plugin derive their registrations
 * from this declarative catalog, eliminating drift between the two.
 */

/** HTTP methods used by the API. */
export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

/** Descriptor for a single API endpoint. */
export interface EndpointDescriptor {
  /** Unique endpoint identifier (camelCase). */
  name: string;
  /** HTTP method. */
  method: HttpMethod;
  /** URL path pattern (e.g. '/jobs/:id'). */
  path: string;
  /** Human-readable description of the endpoint's purpose. */
  description: string;
}

/**
 * Canonical endpoint catalog for the jeeves-runner API.
 *
 * Every entry describes a single HTTP endpoint exposed by the service.
 * Route handlers, plugin tools, and HTTP clients should reference these
 * descriptors rather than hard-coding paths and descriptions.
 */
export const RUNNER_ENDPOINTS = [
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
    description: 'List all jobs with last run status',
  },
  {
    name: 'createJob',
    method: 'POST',
    path: '/jobs',
    description: 'Create a new job',
  },
  {
    name: 'jobDetail',
    method: 'GET',
    path: '/jobs/:id',
    description: 'Single job detail',
  },
  {
    name: 'updateJob',
    method: 'PATCH',
    path: '/jobs/:id',
    description: 'Partial update of job config',
  },
  {
    name: 'deleteJob',
    method: 'DELETE',
    path: '/jobs/:id',
    description: 'Remove a job and its runs',
  },
  {
    name: 'enableJob',
    method: 'PATCH',
    path: '/jobs/:id/enable',
    description: 'Enable a job',
  },
  {
    name: 'disableJob',
    method: 'PATCH',
    path: '/jobs/:id/disable',
    description: 'Disable a job',
  },
  {
    name: 'updateScript',
    method: 'PUT',
    path: '/jobs/:id/script',
    description: 'Update job script (path or inline)',
  },
  {
    name: 'triggerJob',
    method: 'POST',
    path: '/jobs/:id/run',
    description: 'Trigger manual run',
  },
  {
    name: 'jobRuns',
    method: 'GET',
    path: '/jobs/:id/runs',
    description: 'Run history (limit param)',
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
    description: 'List all queue names',
  },
  {
    name: 'queueStatus',
    method: 'GET',
    path: '/queues/:name/status',
    description: 'Queue depth, claimed, failed, oldest age',
  },
  {
    name: 'queuePeek',
    method: 'GET',
    path: '/queues/:name/peek',
    description: 'Peek at pending items (optional limit)',
  },
  {
    name: 'listNamespaces',
    method: 'GET',
    path: '/state',
    description: 'List all state namespaces',
  },
  {
    name: 'queryState',
    method: 'GET',
    path: '/state/:namespace',
    description: 'Scalar state (optional JSONPath)',
  },
  {
    name: 'queryCollection',
    method: 'GET',
    path: '/state/:namespace/:key',
    description: 'Collection items (optional JSONPath, limit, order)',
  },
] as const satisfies readonly EndpointDescriptor[];

/** Union of all endpoint names. */
export type EndpointName = (typeof RUNNER_ENDPOINTS)[number]['name'];

/** Single entry from the catalog, narrowed by name. */
export type Endpoint<N extends EndpointName> = Extract<
  (typeof RUNNER_ENDPOINTS)[number],
  { name: N }
>;

/**
 * Look up an endpoint descriptor by name.
 *
 * @param name - The endpoint identifier.
 * @returns The matching {@link EndpointDescriptor}.
 */
export function getEndpoint<N extends EndpointName>(name: N): Endpoint<N> {
  const ep = RUNNER_ENDPOINTS.find((e) => e.name === name);
  if (!ep) throw new Error(`Unknown endpoint: ${name}`);
  return ep as Endpoint<N>;
}
