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
export {
  executeJob,
  resolveCommand,
  TS_EXTENSIONS,
} from './scheduler/executor.js';

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
