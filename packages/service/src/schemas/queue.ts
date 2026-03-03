/**
 * Queue definition schema and types.
 *
 * @module
 */

import { z } from 'zod';

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
