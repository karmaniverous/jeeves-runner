/**
 * Run record schema and types.
 *
 * @module
 */

import { z } from 'zod';

export const runStatusSchema = z.enum([
  'pending',
  'running',
  'ok',
  'error',
  'timeout',
  'skipped',
]);
export const runTriggerSchema = z.enum(['schedule', 'manual', 'retry']);

export const runSchema = z.object({
  id: z.number(),
  jobId: z.string(),
  status: runStatusSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
  exitCode: z.number().optional(),
  tokens: z.number().optional(),
  resultMeta: z.string().optional(),
  error: z.string().optional(),
  stdoutTail: z.string().optional(),
  stderrTail: z.string().optional(),
  trigger: runTriggerSchema.default('schedule'),
});

export type Run = z.infer<typeof runSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunTrigger = z.infer<typeof runTriggerSchema>;
