/**
 * Public API exports for \@karmaniverous/jeeves-runner.
 *
 * @module
 */

// Schemas
export type { RunnerConfig } from './schemas/config.js';
export { runnerConfigSchema } from './schemas/config.js';
export type { Job } from './schemas/job.js';
export { jobSchema } from './schemas/job.js';
export type { Queue } from './schemas/queue.js';
export { queueSchema } from './schemas/queue.js';
export type { Run, RunStatus, RunTrigger } from './schemas/run.js';
export { runSchema, runStatusSchema, runTriggerSchema } from './schemas/run.js';

// Runner
export type { Runner, RunnerDeps } from './runner.js';
export { createRunner } from './runner.js';

// Client
export type { QueueItem, RunnerClient } from './client/client.js';
export { createClient } from './client/client.js';

// Executor
export type {
  ExecutionOptions,
  ExecutionResult,
  ResolvedCommand,
} from './scheduler/executor.js';
export { executeJob, resolveCommand } from './scheduler/executor.js';

// Scheduler
export type { Scheduler, SchedulerDeps } from './scheduler/scheduler.js';
export { createScheduler } from './scheduler/scheduler.js';

// Schedule utilities
export type {
  ScheduleInvalid,
  ScheduleValid,
  ScheduleValidation,
} from './scheduler/schedule-utils.js';
export {
  getNextFireTime,
  validateSchedule,
} from './scheduler/schedule-utils.js';

// Gateway
export type {
  GatewayClient,
  GatewayClientOptions,
  SessionInfo,
  SessionMessage,
  SpawnSessionOptions,
  SpawnSessionResult,
} from './gateway/client.js';
export { createGatewayClient } from './gateway/client.js';

// Session executor
export type { SessionExecutionOptions } from './scheduler/session-executor.js';
export { executeSession } from './scheduler/session-executor.js';

// Notifier
export type { Notifier, NotifyConfig, NotifyLogger } from './notify/slack.js';
export { createNotifier } from './notify/slack.js';

// Database
export { closeConnection, createConnection } from './db/connection.js';
export type { Maintenance, MaintenanceConfig } from './db/maintenance.js';
export { createMaintenance } from './db/maintenance.js';
export { runMigrations } from './db/migrations.js';

// Config migration
export { migrateConfig } from './lib/migrate-config.js';

// Client utilities (for use in runner job scripts)
export {
  appendJsonl,
  ensureDir,
  getArg,
  loadEnvFile,
  nowIso,
  parseArgs,
  readJson,
  readJsonl,
  sleepAsync,
  sleepMs,
  uuid,
  writeJsonAtomic,
  writeJsonl,
} from './client/fs-utils.js';
export type { AccountConfig, GoogleAuthOptions } from './client/google-auth.js';
export { createGoogleAuth } from './client/google-auth.js';
export { runScript } from './client/run-script.js';
export { getRunnerClient } from './client/runner-client.js';
export type { RetryOptions, RunOptions } from './client/shell.js';
export { run, runWithRetry } from './client/shell.js';
export type { SlackWorkspaceOptions } from './client/slack-workspace.js';
export {
  getChannelWorkspace,
  saveCache as saveSlackWorkspaceCache,
} from './client/slack-workspace.js';
export type { DispatchOptions } from './client/spawn-worker.js';
export { dispatchSession, runDispatcher } from './client/spawn-worker.js';
