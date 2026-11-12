/**
 * Descriptions of the runner's own (non-standard) endpoints, shared by
 * `RUNNER_CATALOG` and the deprecated `RUNNER_ENDPOINTS`, so OpenAPI, the SDK
 * and the plugin tools describe each endpoint in one wording. Pure data.
 *
 * @module descriptions
 */

/** Description of each runner endpoint, keyed by entry name. */
export const ENDPOINT_DESCRIPTIONS = {
  listJobs: 'List all jobs with last run status',
  createJob: 'Create a new job',
  jobDetail: 'Single job detail',
  updateJob:
    'Partial update of job config; omitted fields stay unchanged. Schedule changes on jeeves-scripts launcher jobs revert on the next sync-jobs (the manifest schedule is authoritative); change those in jeeves-scripts.json instead.',
  deleteJob: 'Remove a job and its runs',
  enableJob: 'Enable a job',
  disableJob: 'Disable a job',
  updateScript: 'Update job script (path or inline)',
  triggerJob: 'Trigger manual run',
  jobRuns: 'Run history (limit param)',
  listQueues: 'List all queue names',
  queueStatus: 'Queue depth, claimed, failed, oldest age',
  queuePeek: 'Peek at pending items (optional limit)',
  listNamespaces: 'List all state namespaces',
  queryState: 'Scalar state (optional JSONPath)',
  queryCollection: 'Collection items (optional JSONPath, limit, order)',
} as const;
