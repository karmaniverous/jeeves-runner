/**
 * Shared HTTP response contracts between service and plugin.
 *
 * These types define the shape of responses from the jeeves-runner service
 * HTTP API, consumed by both the service route handlers and the OpenClaw
 * plugin client.
 *
 * Deprecated (DD#86, DD#88): `JobListItem` and `JobDetailResponse` extend
 * the camelCase `Job`, which is not what the routes send. The schemas behind
 * `RUNNER_CATALOG` describe the wire; these types stay unchanged until a
 * breaking core release.
 *
 * Only the deprecated aliases are exported, so the package entry re-exports
 * this module with `export type *` (a named re-export of a deprecated symbol
 * fails `no-deprecated`).
 *
 * @module contracts
 */

import type { Job } from './schemas.js';

/** Job row with last run metadata, as returned by GET /jobs. */
interface JobListItemShape extends Job {
  /** Status of the most recent run (null if never run). */
  last_status: string | null;
  /** ISO timestamp of the most recent run start (null if never run). */
  last_run: string | null;
}

/** GET /jobs response envelope. */
interface JobsResponseShape {
  jobs: JobListItemShape[];
}

/** GET /jobs/:id response envelope. */
interface JobDetailResponseShape {
  job: Job;
}

/** Run record as returned by the API (snake_case DB columns). */
interface RunRecordShape {
  id: number;
  job_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  tokens: number | null;
  result_meta: string | null;
  error: string | null;
  stdout_tail: string | null;
  stderr_tail: string | null;
  trigger: string;
}

/** GET /jobs/:id/runs response envelope. */
interface RunsResponseShape {
  runs: RunRecordShape[];
}

/** GET /queues response — list of distinct queue names with items. */
interface QueuesResponseShape {
  queues: string[];
}

/** GET /queues/:name/status response. */
interface QueueStatusResponseShape {
  depth: number;
  claimedCount: number;
  failedCount: number;
  oldestAge: number | null;
}

/** Queue peek item. */
interface QueuePeekItemShape {
  id: number;
  payload: unknown;
  priority: number;
  createdAt: string;
}

/** GET /queues/:name/peek response envelope. */
interface QueuePeekResponseShape {
  items: QueuePeekItemShape[];
}

/** GET /state response — list of distinct namespaces. */
interface NamespacesResponseShape {
  namespaces: string[];
}

/** GET /state/:namespace response — scalar state as key-value map. */
interface StateResponseShape {
  [key: string]: string | null;
}

/** Single item in a state collection. */
interface StateCollectionItemShape {
  itemKey: string;
  value: string | null;
  updatedAt: string;
}

/** GET /state/:namespace/:key response — scalar value + collection items. */
interface CollectionResponseShape {
  value: string | null;
  items: StateCollectionItemShape[];
  count: number;
}

/**
 * Job row with last run metadata, as returned by GET /jobs.
 *
 * @deprecated Use `JobListRow` (the row as sent: snake_case, `enabled` 0/1), inferred from `RUNNER_CATALOG`.
 */
export type JobListItem = JobListItemShape;

/**
 * GET /jobs response envelope.
 *
 * @deprecated Use `RunnerResponse<'listJobs'>`, inferred from `RUNNER_CATALOG`.
 */
export type JobsResponse = JobsResponseShape;

/**
 * GET /jobs/:id response envelope.
 *
 * @deprecated Use `RunnerResponse<'jobDetail'>`, inferred from `RUNNER_CATALOG`.
 */
export type JobDetailResponse = JobDetailResponseShape;

/**
 * Run record as returned by the API (snake_case DB columns).
 *
 * @deprecated Use `RunRow`, inferred from `RUNNER_CATALOG`.
 */
export type RunRecord = RunRecordShape;

/**
 * GET /jobs/:id/runs response envelope.
 *
 * @deprecated Use `RunnerResponse<'jobRuns'>`, inferred from `RUNNER_CATALOG`.
 */
export type RunsResponse = RunsResponseShape;

/**
 * GET /queues response — list of distinct queue names with items.
 *
 * @deprecated Use `RunnerResponse<'listQueues'>`, inferred from `RUNNER_CATALOG`.
 */
export type QueuesResponse = QueuesResponseShape;

/**
 * GET /queues/:name/status response.
 *
 * @deprecated Use `RunnerResponse<'queueStatus'>`, inferred from `RUNNER_CATALOG`.
 */
export type QueueStatusResponse = QueueStatusResponseShape;

/**
 * Queue peek item.
 *
 * @deprecated Use `RunnerResponse<'queuePeek'>['items'][number]`, inferred from `RUNNER_CATALOG`.
 */
export type QueuePeekItem = QueuePeekItemShape;

/**
 * GET /queues/:name/peek response envelope.
 *
 * @deprecated Use `RunnerResponse<'queuePeek'>`, inferred from `RUNNER_CATALOG`.
 */
export type QueuePeekResponse = QueuePeekResponseShape;

/**
 * GET /state response — list of distinct namespaces.
 *
 * @deprecated Use `RunnerResponse<'listNamespaces'>`, inferred from `RUNNER_CATALOG`.
 */
export type NamespacesResponse = NamespacesResponseShape;

/**
 * GET /state/:namespace response — scalar state as key-value map.
 *
 * @deprecated Use `RunnerResponse<'queryState'>`, inferred from `RUNNER_CATALOG`.
 */
export type StateResponse = StateResponseShape;

/**
 * Single item in a state collection.
 *
 * @deprecated Use `RunnerResponse<'queryCollection'>` items, inferred from `RUNNER_CATALOG`.
 */
export type StateCollectionItem = StateCollectionItemShape;

/**
 * GET /state/:namespace/:key response — scalar value + collection items.
 *
 * @deprecated Use `RunnerResponse<'queryCollection'>`, inferred from `RUNNER_CATALOG`.
 */
export type CollectionResponse = CollectionResponseShape;
