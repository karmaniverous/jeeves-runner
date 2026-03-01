/**
 * Job definition schema and types.
 *
 * @module
 */

import { z } from 'zod';

/** Job definition schema for scheduled tasks. */
export const jobSchema = z.object({
  /** Unique job identifier. */
  id: z.string(),
  /** Human-readable job name. */
  name: z.string(),
  /** Cron expression defining the job schedule. */
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
  /** Policy for handling overlapping job executions (skip, queue, or allow). */
  overlapPolicy: z.enum(['skip', 'queue', 'allow']).default('skip'),
  /** Slack channel ID for failure notifications. */
  onFailure: z.string().nullable().default(null),
  /** Slack channel ID for success notifications. */
  onSuccess: z.string().nullable().default(null),
});

/** Inferred Job type from schema. */
export type Job = z.infer<typeof jobSchema>;
