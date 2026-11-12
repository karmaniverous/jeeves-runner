/**
 * Shared configuration schema, endpoint catalog, and entity schemas
 * for jeeves-runner packages.
 *
 * @packageDocumentation
 */

// Endpoint catalog (DD#86, DD#88)
export {
  type JobListRow,
  type JobRow,
  RUNNER_CATALOG,
  type RunnerCatalog,
  type RunnerEntry,
  type RunnerEntryName,
  type RunnerHealth,
  type RunnerInput,
  type RunnerResponse,
  type RunResult,
  type RunRow,
} from './catalog.js';
export {
  collectionBodySchema,
  executionResultSchema,
  jobListRowSchema,
  jobRowSchema,
  jsonPathResultSchema,
  okResponseSchema,
  queuePeekItemSchema,
  queueStatusSchema,
  runnerHealthSchema,
  runRowSchema,
  stateCollectionItemSchema,
} from './catalog/rows.js';

// Error codes and their statuses (DD#96)
export {
  RUNNER_ERROR_CODES,
  RUNNER_ERROR_STATUS,
  type RunnerErrorCode,
} from './errors.js';

// OpenAPI document generated from the catalog (DD#93)
export { RUNNER_OPENAPI_DOCUMENT } from './openapi.js';

// Configuration
export { type RunnerConfig, runnerConfigSchema } from './config.js';

// Deprecated (DD#86): response contracts and the endpoint list, superseded by
// the catalog types above. `export *` because a named re-export of a
// deprecated symbol fails `no-deprecated`; both modules export only these.
export type * from './contracts.js';
export * from './endpoints.js';

// jeeves-scripts manifest mapping (DD#61, DD#62)
export type {
  JobField,
  LauncherJobDefinition,
  PathPlatform,
  ScriptsListEntry,
  ScriptsManifest,
} from './scripts-mapping.js';
export {
  getLauncherPath,
  isLauncherScript,
  manifestEntryToJob,
  normalizeScriptPath,
  OPTIONAL_JOB_KEYS,
  SCRIPTS_LAUNCHER_PATH,
  scriptsListEntrySchema,
  scriptsListSchema,
  scriptsManifestSchema,
  specifiedJobFields,
} from './scripts-mapping.js';

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
