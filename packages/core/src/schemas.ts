/**
 * Canonical Zod schemas for jeeves-runner entities.
 *
 * Single source of truth for job, run, and queue schemas. Both the service
 * package and the OpenClaw plugin derive their validation from these.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

/** Job definition schema for scheduled tasks. */
export const jobSchema = z.object({
  /** Unique job identifier. */
  id: z.string(),
  /** Human-readable job name. */
  name: z.string(),
  /** Cron or RRStack schedule expression. */
  schedule: z.string(),
  /** Script path or command to execute. */
  script: z.string(),
  /** Job execution type (script or session). */
  type: z.enum(['script', 'session']).default('script'),
  /** Optional job description. */
  description: z.string().optional(),
  /** Whether the job is enabled for scheduling. */
  enabled: z.boolean().default(true),
  /** Optional execution timeout in milliseconds. */
  timeoutMs: z.number().optional(),
  /** Policy for handling overlapping job executions (skip or allow). */
  overlapPolicy: z.enum(['skip', 'allow']).default('skip'),
  /** Script source type: 'path' uses script as file path, 'inline' treats script as source code. */
  sourceType: z.enum(['path', 'inline']).default('path'),
  /** Slack channel ID for failure notifications. */
  onFailure: z.string().nullable().default(null),
  /** Slack channel ID for success notifications. */
  onSuccess: z.string().nullable().default(null),
  /** Output channel identifier for routing session results. */
  outputChannel: z.string().nullable().default(null),
  /** Optional environment variables for script-type jobs. Spread into spawn env alongside JR_* vars. Ignored for session-type jobs. */
  env: z.record(z.string(), z.string()).optional(),
  /** Optional arguments for script-type jobs. Appended after the script path in the spawn call. Ignored for session-type jobs. */
  args: z.array(z.string()).optional(),
});

/** Inferred Job type from schema. */
export type Job = z.infer<typeof jobSchema>;

// ---------------------------------------------------------------------------
// Job API schemas (create / update / script)
// ---------------------------------------------------------------------------

/**
 * Zod schema for job creation request body.
 *
 * Uses snake_case field names to match the HTTP API convention. Required
 * fields: id, name, schedule, script. All others are optional with defaults.
 */
export const createJobSchema = z.object({
  /** Unique job identifier. */
  id: z.string().min(1),
  /** Human-readable job name. */
  name: z.string().min(1),
  /** Cron or RRStack schedule expression. */
  schedule: z.string().min(1),
  /** Script path or command to execute. */
  script: z.string().min(1),
  /** Script source type: 'path' (file path) or 'inline' (source code). */
  source_type: z.enum(['path', 'inline']).default('path'),
  /** Job execution type (script or session). */
  type: z.enum(['script', 'session']).default('script'),
  /** Timeout in seconds (converted to timeout_ms internally). */
  timeout_seconds: z.number().positive().optional(),
  /** Policy for handling overlapping job executions. */
  overlap_policy: z.enum(['skip', 'allow']).default('skip'),
  /** Whether the job is enabled for scheduling. */
  enabled: z.boolean().default(true),
  /** Optional job description. */
  description: z.string().optional(),
  /** Slack channel ID for failure notifications. */
  on_failure: z.string().nullable().optional(),
  /** Slack channel ID for success notifications. */
  on_success: z.string().nullable().optional(),
  /** Output channel identifier for routing session results. */
  output_channel: z.string().nullable().optional(),
  /** Optional environment variables for script-type jobs. */
  env: z.record(z.string(), z.string()).optional(),
  /** Optional arguments for script-type jobs. */
  args: z.array(z.string()).optional(),
});

/** Inferred CreateJob type from schema. */
export type CreateJob = z.infer<typeof createJobSchema>;

/**
 * Zod schema for job update request body (all fields optional except id omitted).
 */
export const updateJobSchema = createJobSchema.omit({ id: true }).partial();

/** Inferred UpdateJob type from schema. */
export type UpdateJob = z.infer<typeof updateJobSchema>;

/**
 * Zod schema for script update request body.
 */
export const updateScriptSchema = z.object({
  /** New script content (path or inline source). */
  script: z.string().min(1),
  /** Optional source type override. */
  source_type: z.enum(['path', 'inline']).optional(),
});

/** Inferred UpdateScript type from schema. */
export type UpdateScript = z.infer<typeof updateScriptSchema>;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** Run status enumeration schema. */
export const runStatusSchema = z.enum([
  'pending',
  'running',
  'ok',
  'error',
  'timeout',
  'skipped',
]);

/** Run trigger type enumeration schema. */
export const runTriggerSchema = z.enum(['schedule', 'manual']);

/** Run record schema representing a job execution instance. */
export const runSchema = z.object({
  /** Unique run identifier. */
  id: z.number(),
  /** Reference to the parent job ID. */
  jobId: z.string(),
  /** Current execution status. */
  status: runStatusSchema,
  /** ISO timestamp when execution started. */
  startedAt: z.string().optional(),
  /** ISO timestamp when execution finished. */
  finishedAt: z.string().optional(),
  /** Execution duration in milliseconds. */
  durationMs: z.number().optional(),
  /** Process exit code. */
  exitCode: z.number().optional(),
  /** Token count for session-type jobs. */
  tokens: z.number().optional(),
  /** Additional result metadata (JSON string). */
  resultMeta: z.string().optional(),
  /** Error message if execution failed. */
  error: z.string().optional(),
  /** Last N characters of stdout. */
  stdoutTail: z.string().optional(),
  /** Last N characters of stderr. */
  stderrTail: z.string().optional(),
  /** What triggered this run (schedule or manual). */
  trigger: runTriggerSchema.default('schedule'),
});

/** Inferred Run type representing a job execution record. */
export type Run = z.infer<typeof runSchema>;

/** Inferred RunStatus type from schema. */
export type RunStatus = z.infer<typeof runStatusSchema>;

/** Inferred RunTrigger type from schema. */
export type RunTrigger = z.infer<typeof runTriggerSchema>;

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/** Queue definition schema for managing queue behavior and retention. */
export const queueSchema = z.object({
  /** Unique queue identifier. */
  id: z.string(),
  /** Human-readable queue name. */
  name: z.string(),
  /** Optional queue description. */
  description: z.string().nullable().optional(),
  /** JSONPath expression for deduplication key extraction. */
  dedupExpr: z.string().nullable().optional(),
  /** Deduplication scope: 'pending' checks pending/processing items, 'all' checks all non-failed items. */
  dedupScope: z.enum(['pending', 'all']).default('pending'),
  /** Maximum retry attempts before dead-lettering. */
  maxAttempts: z.number().default(1),
  /** Retention period in days for completed/failed items. */
  retentionDays: z.number().default(7),
  /** Queue creation timestamp. */
  createdAt: z.string(),
});

/** Inferred Queue type from schema. */
export type Queue = z.infer<typeof queueSchema>;
