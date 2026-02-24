/**
 * Runner configuration schema and types.
 *
 * @module
 */

import { z } from 'zod';

/** Notification configuration sub-schema. */
const notificationsSchema = z.object({
  slackTokenPath: z.string().optional(),
  defaultOnFailure: z.string().nullable().default(null),
  defaultOnSuccess: z.string().nullable().default(null),
});

/** Log configuration sub-schema. */
const logSchema = z.object({
  level: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  file: z.string().optional(),
});

/** Full runner configuration schema. Validates and provides defaults. */
export const runnerConfigSchema = z.object({
  port: z.number().default(3100),
  dbPath: z.string().default('./data/runner.sqlite'),
  maxConcurrency: z.number().default(4),
  runRetentionDays: z.number().default(30),
  cursorCleanupIntervalMs: z.number().default(3600000),
  shutdownGraceMs: z.number().default(30000),
  notifications: notificationsSchema.default({
    defaultOnFailure: null,
    defaultOnSuccess: null,
  }),
  log: logSchema.default({ level: 'info' }),
});

/** Inferred runner configuration type. */
export type RunnerConfig = z.infer<typeof runnerConfigSchema>;
