/**
 * Shared configuration schema, endpoint catalog, and entity schemas
 * for jeeves-runner packages.
 *
 * @packageDocumentation
 */

// Configuration
export { type RunnerConfig, runnerConfigSchema } from './config.js';

// Contracts (shared response types)
export type {
  JobDetailResponse,
  JobListItem,
  JobsResponse,
  QueuePeekItem,
  QueuePeekResponse,
  QueueStatusResponse,
  RunRecord,
  RunsResponse,
} from './contracts.js';

// Endpoints
export type {
  Endpoint,
  EndpointDescriptor,
  EndpointName,
  HttpMethod,
} from './endpoints.js';
export { getEndpoint, RUNNER_ENDPOINTS } from './endpoints.js';

// Schemas
export type {
  CreateJob,
  Job,
  Queue,
  Run,
  RunStatus,
  RunTrigger,
  UpdateJob,
  UpdateScript,
} from './schemas.js';
export {
  createJobSchema,
  jobSchema,
  queueSchema,
  runSchema,
  runStatusSchema,
  runTriggerSchema,
  updateJobSchema,
  updateScriptSchema,
} from './schemas.js';
