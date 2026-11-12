/**
 * @module jeeves-runner-sdk
 * Typed TypeScript client for the jeeves-runner HTTP API, built from the runner's endpoint catalog (`RUNNER_CATALOG`). Start with {@link createRunnerClient}; every failure is a {@link RunnerError}.
 */

export {
  type CallOptions,
  createRunnerClient,
  type RunnerClient,
} from './createRunnerClient.js';
export {
  DEFAULT_TIMEOUT_MS,
  type FetchLike,
  type RunnerClientOptions,
  TRIGGER_TIMEOUT_MS,
} from './options.js';
export {
  errorBodyText,
  isRunnerError,
  type RunnerClientErrorCode,
  RunnerError,
  type RunnerErrorInit,
} from './RunnerError.js';

// The runner's error codes and their statuses (DD#96).
export {
  RUNNER_ERROR_CODES,
  RUNNER_ERROR_STATUS,
  type RunnerErrorCode,
} from '@karmaniverous/jeeves-runner-core';

// Request and response types, inferred from the catalog.
export type {
  JobListRow,
  JobRow,
  RunnerEntryName,
  RunnerHealth,
  RunnerInput,
  RunnerResponse,
  RunResult,
  RunRow,
} from '@karmaniverous/jeeves-runner-core';
