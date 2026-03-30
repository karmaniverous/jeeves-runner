/**
 * Runner configuration schema and types.
 *
 * @module
 */

import { DEFAULT_BIND_ADDRESS } from '@karmaniverous/jeeves';
import { z } from 'zod';

/** Notification configuration sub-schema. */
const notificationsSchema = z.object({
  /** Path to Slack bot token file. */
  slackTokenPath: z.string().optional(),
  /** Default Slack channel ID for failure notifications. */
  defaultOnFailure: z.string().nullable().default(null),
  /** Default Slack channel ID for success notifications. */
  defaultOnSuccess: z.string().nullable().default(null),
});

/** Log configuration sub-schema. */
const logSchema = z.object({
  /** Log level threshold (trace, debug, info, warn, error, fatal). */
  level: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  /** Optional log file path. */
  file: z.string().optional(),
});

/** Gateway configuration sub-schema. */
const gatewaySchema = z.object({
  /** OpenClaw Gateway URL. */
  url: z.string().default('http://127.0.0.1:18789'),
  /** Path to file containing Gateway auth token. */
  tokenPath: z.string().optional(),
});

/** Full runner configuration schema. Validates and provides defaults. */
export const runnerConfigSchema = z.object({
  /** HTTP server port for the runner API. */
  port: z.number().default(1937),
  /** Bind address for the HTTP server. Defaults to the platform-standard bind address. */
  host: z.string().default(DEFAULT_BIND_ADDRESS),
  /** Path to SQLite database file. */
  dbPath: z.string().default('./data/runner.sqlite'),
  /** Maximum number of concurrent job executions. */
  maxConcurrency: z.number().default(4),
  /** Number of days to retain completed run records. */
  runRetentionDays: z.number().default(30),
  /** Interval in milliseconds for expired state cleanup task. */
  stateCleanupIntervalMs: z.number().default(3600000),
  /** Grace period in milliseconds for shutdown completion. */
  shutdownGraceMs: z.number().default(30000),
  /** Interval in milliseconds for job reconciliation checks. */
  reconcileIntervalMs: z.number().default(60000),
  /** Notification configuration for job completion events. */
  notifications: notificationsSchema.default({
    defaultOnFailure: null,
    defaultOnSuccess: null,
  }),
  /** Logging configuration. */
  log: logSchema.default({ level: 'info' }),
  /** Gateway configuration for session-type jobs. */
  gateway: gatewaySchema.default({ url: 'http://127.0.0.1:18789' }),
  /** Custom command runners keyed by file extension. The command string is split on whitespace; first token is the executable, rest are prefix args before the script path. Falls back to built-in defaults for unconfigured extensions. */
  runners: z.record(z.string(), z.string().trim().min(1)).default({}),
});

/** Inferred runner configuration type. */
export type RunnerConfig = z.infer<typeof runnerConfigSchema>;
