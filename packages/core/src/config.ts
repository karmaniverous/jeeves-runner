import { DEFAULT_BIND_ADDRESS, RUNNER_PORT } from '@karmaniverous/jeeves';
import { z } from 'zod';

/** Default OpenClaw Gateway URL. */
const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18789';

/** Notification configuration sub-schema. */
const notificationsSchema = z.object({
  /** Path to Slack bot token file. */
  slackTokenPath: z.string().optional(),
  /** Default Slack channel ID for failure notifications. */
  defaultOnFailure: z.string().nullable().default(null),
  /** Default Slack channel ID for success notifications. */
  defaultOnSuccess: z.string().nullable().default(null),
});

/** Logging configuration sub-schema. */
const loggingSchema = z.object({
  /** Log level threshold (trace, debug, info, warn, error, fatal). */
  level: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  /** Optional log file path. */
  file: z.string().optional(),
});

/**
 * Migrate deprecated config keys to the new shape.
 *
 * - `gateway.url` → `gatewayUrl`
 * - `gateway.tokenPath` → dropped (was file-based; use `gatewayApiKey` direct value)
 * - `log` → `logging`
 */
function migrateDeprecatedKeys(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;

  const obj = { ...(input as Record<string, unknown>) };

  // gateway → gatewayUrl / gatewayApiKey
  if ('gateway' in obj && typeof obj.gateway === 'object' && obj.gateway) {
    const gw = obj.gateway as Record<string, unknown>;
    if (!('gatewayUrl' in obj) && 'url' in gw) {
      obj.gatewayUrl = gw.url;
    }
    if ('tokenPath' in gw) {
      console.warn(
        '[jeeves-runner] DEPRECATED: config key "gateway.tokenPath" (file-based token) has been removed. ' +
          'Set "gatewayApiKey" to a direct API key string, or use the OPENCLAW_GATEWAY_TOKEN environment variable.',
      );
    }
    delete obj.gateway;
    console.warn(
      '[jeeves-runner] DEPRECATED: config key "gateway" is deprecated. Use "gatewayUrl" and "gatewayApiKey" instead.',
    );
  }

  // log → logging
  if ('log' in obj) {
    if (!('logging' in obj)) {
      obj.logging = obj.log;
    }
    delete obj.log;
    console.warn(
      '[jeeves-runner] DEPRECATED: config key "log" is deprecated. Use "logging" instead.',
    );
  }

  return obj;
}

/** Full runner configuration schema. Validates and provides defaults. */
export const runnerConfigSchema = z.preprocess(
  migrateDeprecatedKeys,
  z.object({
    /** HTTP server port for the runner API. */
    port: z.number().default(RUNNER_PORT),
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
    logging: loggingSchema.default({ level: 'info' }),
    /** OpenClaw Gateway URL. */
    gatewayUrl: z.string().default(DEFAULT_GATEWAY_URL),
    /** OpenClaw Gateway API key (direct value). Falls back to OPENCLAW_GATEWAY_TOKEN env var at runtime. */
    gatewayApiKey: z.string().optional(),
    /** Custom command runners keyed by file extension. The command string is split on whitespace; first token is the executable, rest are prefix args before the script path. Falls back to built-in defaults for unconfigured extensions. */
    runners: z.record(z.string(), z.string().trim().min(1)).default({}),
    /** Absolute path to directory containing job definition files. When omitted, sync-jobs falls back to join(configDir, 'scripts/jobs'). */
    jobsDir: z.string().optional(),
  }),
);

/** Inferred runner configuration type. */
export type RunnerConfig = z.infer<typeof runnerConfigSchema>;
