/**
 * Shared HTTP response contracts between service and plugin.
 *
 * These types define the shape of responses from the jeeves-runner service
 * HTTP API, consumed by both the service route handlers and the OpenClaw
 * plugin client.
 */

import type { Job } from './schemas.js';

/** Job row with last run metadata, as returned by GET /jobs. */
export interface JobListItem extends Job {
  /** Status of the most recent run (null if never run). */
  last_status: string | null;
  /** ISO timestamp of the most recent run start (null if never run). */
  last_run: string | null;
}

/** GET /jobs response envelope. */
export interface JobsResponse {
  jobs: JobListItem[];
}

/** GET /jobs/:id response envelope. */
export interface JobDetailResponse {
  job: Job;
}

/** Run record as returned by the API (snake_case DB columns). */
export interface RunRecord {
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
export interface RunsResponse {
  runs: RunRecord[];
}

/** GET /queues response — list of distinct queue names with items. */
export interface QueuesResponse {
  queues: string[];
}

/** GET /queues/:name/status response. */
export interface QueueStatusResponse {
  depth: number;
  claimedCount: number;
  failedCount: number;
  oldestAge: number | null;
}

/** Queue peek item. */
export interface QueuePeekItem {
  id: number;
  payload: unknown;
  priority: number;
  createdAt: string;
}

/** GET /queues/:name/peek response envelope. */
export interface QueuePeekResponse {
  items: QueuePeekItem[];
}

/** GET /state response — list of distinct namespaces. */
export interface NamespacesResponse {
  namespaces: string[];
}

/** GET /state/:namespace response — scalar state as key-value map. */
export interface StateResponse {
  [key: string]: string | null;
}

/** Single item in a state collection. */
export interface StateCollectionItem {
  itemKey: string;
  value: string | null;
  updatedAt: string;
}

/** GET /state/:namespace/:key response — scalar value + collection items. */
export interface CollectionResponse {
  value: string | null;
  items: StateCollectionItem[];
  count: number;
}
