/**
 * Runner configuration schema and types.
 *
 * @module
 */

import { z } from 'zod';

export const runnerConfigSchema = z.object({
  port: z.number().default(3100),
  dbPath: z.string().default('./data/runner.sqlite'),
  maxConcurrency: z.number().default(4),
  runRetentionDays: z.number().default(30),
  cursorCleanupIntervalMs: z.number().default(3600000),
  shutdownGraceMs: z.number().default(30000),
  notifications: z
    .object({
      slackTokenPath: z.string().optional(),
      defaultOnFailure: z.string().nullable().default(null),
      defaultOnSuccess: z.string().nullable().default(null),
    })
    .default({}),
  log: z
    .object({
      level: z
        .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
        .default('info'),
      file: z.string().optional(),
    })
    .default({}),
});

export type RunnerConfig = z.infer<typeof runnerConfigSchema>;
