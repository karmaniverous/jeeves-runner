/**
 * Pure mapping from a jeeves-scripts `list --json` entry to a runner job
 * definition (DD#61, DD#62).
 *
 * Shared by jeeves-runner `sync-jobs` and jeeves-tools deploy so both
 * register identical jobs. No SQL, no database handle and no I/O: callers
 * own diffing and persistence.
 *
 * @module
 */

import { posix, win32 } from 'node:path';

import { z } from 'zod';

/**
 * Timeout applied to a launcher job whose manifest sets no
 * `timeout_seconds` (DD#71). Covers the ~7s launcher cold start.
 */
export const DEFAULT_LAUNCHER_TIMEOUT_MS = 10_000;

/** Path of the jeeves-scripts launcher, relative to the scripts dir. */
export const SCRIPTS_LAUNCHER_PATH = 'bin/jeeves-scripts.js';

/** RRStack schedule object or cron/RRStack string, as written in a manifest. */
const manifestScheduleSchema = z.union([
  z.string().min(1),
  z.record(z.string(), z.unknown()),
]);

/**
 * Effective job manifest of a runnable, after the instance's deltas.
 *
 * Unknown keys (e.g. `id`, `domain`) are allowed and ignored.
 */
export const scriptsManifestSchema = z.looseObject({
  /** Human-readable job name. */
  name: z.string().min(1),
  /** Cron string or RRStack schedule (string or object). */
  schedule: manifestScheduleSchema,
  /** Optional job description. */
  description: z.string().nullable().optional(),
  /** Job execution type. */
  type: z.enum(['script', 'session']).optional(),
  /** Overlap policy. */
  overlap_policy: z.enum(['skip', 'allow']).optional(),
  /** Timeout in seconds. */
  timeout_seconds: z.number().positive().nullable().optional(),
  /** Whether a newly added job starts enabled. */
  enabled: z.boolean().optional(),
  /** What must be set up first. Informational only (DD#76). */
  prerequisite: z.string().nullable().optional(),
  /** Extra launcher arguments after `run <id>`. */
  args: z.array(z.string()).optional(),
  /** Per-job environment variables. */
  env: z.record(z.string(), z.string()).optional(),
  /** Slack channel for failure notifications. */
  on_failure: z.string().nullable().optional(),
  /** Slack channel for success notifications. */
  on_success: z.string().nullable().optional(),
});

/** Effective job manifest. */
export type ScriptsManifest = z.infer<typeof scriptsManifestSchema>;

/** One entry of `jeeves-scripts list --json`. */
export const scriptsListEntrySchema = z.looseObject({
  /** Runnable id (also the runner job id). */
  id: z.string().min(1),
  /** Effective manifest, or `null` when the runnable is not a scheduled job. */
  manifest: scriptsManifestSchema.nullable(),
});

/** One entry of `jeeves-scripts list --json`. */
export type ScriptsListEntry = z.infer<typeof scriptsListEntrySchema>;

/** Full `jeeves-scripts list --json` output. */
export const scriptsListSchema = z.array(scriptsListEntrySchema);

/** A runner job definition derived from a manifest. */
export interface LauncherJobDefinition {
  /** Job id (the runnable id). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Schedule as stored by the runner (RRStack objects are JSON-encoded). */
  schedule: string;
  /** Absolute launcher path: `<scriptsDir>/bin/jeeves-scripts.js`. */
  script: string;
  /** Launcher arguments: `['run', id, ...manifest.args]`. */
  args: string[];
  /** Job type (default `script`). */
  type: 'script' | 'session';
  /** Description, or `null`. */
  description: string | null;
  /** Timeout in milliseconds (default {@link DEFAULT_LAUNCHER_TIMEOUT_MS}). */
  timeout_ms: number;
  /** Overlap policy (default `skip`). */
  overlap_policy: 'skip' | 'allow';
  /** Enabled state applied when the job is first added (default `true`). */
  enabled: boolean;
  /** Per-job environment variables, or `null`. */
  env: Record<string, string> | null;
  /** Failure notification channel, or `null`. */
  on_failure: string | null;
  /** Success notification channel, or `null`. */
  on_success: string | null;
  /** Informational prerequisite text, or `null` (DD#76). */
  prerequisite: string | null;
}

/** Platform whose path rules apply. */
export type PathPlatform = 'win32' | 'posix';

/** Current platform as a {@link PathPlatform}. */
function currentPlatform(): PathPlatform {
  return process.platform === 'win32' ? 'win32' : 'posix';
}

/**
 * Normalise a path for comparison (DD#70): resolve to absolute, use forward
 * slashes, and lowercase on Windows.
 */
export function normalizeScriptPath(
  path: string,
  platform: PathPlatform = currentPlatform(),
): string {
  if (platform === 'win32') {
    return win32.resolve(path).replace(/\\/g, '/').toLowerCase();
  }
  return posix.resolve(path);
}

/** Absolute launcher path for a scripts dir, in the platform's native form. */
export function getLauncherPath(
  scriptsDir: string,
  platform: PathPlatform = currentPlatform(),
): string {
  const pathApi = platform === 'win32' ? win32 : posix;
  return pathApi.resolve(scriptsDir, SCRIPTS_LAUNCHER_PATH);
}

/** Whether a stored job script is this scripts dir's launcher (DD#70). */
export function isLauncherScript(
  script: string,
  scriptsDir: string,
  platform: PathPlatform = currentPlatform(),
): boolean {
  return (
    normalizeScriptPath(script, platform) ===
    normalizeScriptPath(getLauncherPath(scriptsDir, platform), platform)
  );
}

/**
 * Map one `list --json` entry to a launcher job definition.
 *
 * @returns The job definition, or `null` when the entry has no manifest.
 */
export function manifestEntryToJob(
  entry: ScriptsListEntry,
  scriptsDir: string,
  platform: PathPlatform = currentPlatform(),
): LauncherJobDefinition | null {
  const manifest = entry.manifest;
  if (!manifest) return null;

  return {
    id: entry.id,
    name: manifest.name,
    schedule:
      typeof manifest.schedule === 'string'
        ? manifest.schedule
        : JSON.stringify(manifest.schedule),
    script: getLauncherPath(scriptsDir, platform),
    args: ['run', entry.id, ...(manifest.args ?? [])],
    type: manifest.type ?? 'script',
    description: manifest.description ?? null,
    timeout_ms:
      manifest.timeout_seconds != null
        ? manifest.timeout_seconds * 1000
        : DEFAULT_LAUNCHER_TIMEOUT_MS,
    overlap_policy: manifest.overlap_policy ?? 'skip',
    enabled: manifest.enabled ?? true,
    env: manifest.env ?? null,
    on_failure: manifest.on_failure ?? null,
    on_success: manifest.on_success ?? null,
    prerequisite: manifest.prerequisite ?? null,
  };
}
