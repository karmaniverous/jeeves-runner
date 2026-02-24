/**
 * Job definition schema and types.
 *
 * @module
 */

import { z } from 'zod';

export const jobSchema = z.object({
  id: z.string(),
  name: z.string(),
  schedule: z.string(),
  script: z.string(),
  type: z.enum(['script', 'session']).default('script'),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().optional(),
  overlapPolicy: z.enum(['skip', 'queue', 'allow']).default('skip'),
  onFailure: z.string().nullable().default(null),
  onSuccess: z.string().nullable().default(null),
});

export type Job = z.infer<typeof jobSchema>;
