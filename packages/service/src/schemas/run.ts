/**
 * Run record schema and types.
 *
 * @module
 */

import { z } from 'zod';

/** Run status enumeration schema (pending, running, ok, error, timeout, skipped). */
export const runStatusSchema = z.enum([
  'pending',
  'running',
  'ok',
  'error',
  'timeout',
  'skipped',
]);

/** Run trigger type enumeration schema (schedule, manual, retry). */
export const runTriggerSchema = z.enum(['schedule', 'manual', 'retry']);

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
  /** What triggered this run (schedule, manual, or retry). */
  trigger: runTriggerSchema.default('schedule'),
});

/** Inferred Run type representing a job execution record. */
export type Run = z.infer<typeof runSchema>;

/** Inferred RunStatus type from schema. */
export type RunStatus = z.infer<typeof runStatusSchema>;

/** Inferred RunTrigger type from schema. */
export type RunTrigger = z.infer<typeof runTriggerSchema>;
