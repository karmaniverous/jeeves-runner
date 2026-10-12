/**
 * `jeeves-runner sync-jobs` command action.
 *
 * Source precedence, highest first: the `--scripts-dir` or `--jobs-dir`
 * flag (not both); config `scriptsDir`; legacy config `jobsDir`; the legacy
 * default `configDir/scripts/jobs`. The legacy source prints a deprecation
 * warning (DD#64).
 *
 * Exit codes: 0 when clean (non-null prerequisites included, DD#76);
 * 1 when any entry is skipped for an error or the sync is fatal (DD#63).
 *
 * @module
 */

import { dirname, join, resolve } from 'node:path';

import { getComponentConfigDir, init } from '@karmaniverous/jeeves';

import { loadConfig, withDb } from './config-helpers.js';
import {
  formatSyncReport,
  SyncFatalError,
  syncJobs,
  syncJobsFromScriptsDir,
  type SyncResult,
} from './sync-jobs.js';

/** Parsed `sync-jobs` options. */
export interface SyncCommandOptions {
  /** Path to the runner config file. */
  config?: string;
  /** jeeves-scripts repo dir (overrides config). */
  scriptsDir?: string;
  /** Legacy jobs dir (overrides config; deprecated). */
  jobsDir?: string;
  /** Report the plan without writing. */
  dryRun?: boolean;
  /** Overwrite `enabled` on update with the source value. */
  resetEnabled?: boolean;
  /** Disable orphaned launcher jobs. */
  prune?: boolean;
  /** Workspace root path. */
  workspace: string;
  /** Platform config root path. */
  configRoot: string;
}

/** Selected sync source. */
type SyncSource =
  { kind: 'scripts'; dir: string } | { kind: 'legacy'; dir: string };

/** Pick the sync source, or return an error message. */
function selectSource(
  options: SyncCommandOptions,
  config: ReturnType<typeof loadConfig>,
): SyncSource | string {
  if (options.scriptsDir && options.jobsDir) {
    return '--scripts-dir and --jobs-dir cannot be used together';
  }
  if (options.scriptsDir) return { kind: 'scripts', dir: options.scriptsDir };
  if (options.jobsDir) return { kind: 'legacy', dir: options.jobsDir };
  if (config.scriptsDir) return { kind: 'scripts', dir: config.scriptsDir };

  const configDir = options.config
    ? dirname(resolve(options.config))
    : getComponentConfigDir('runner');
  return {
    kind: 'legacy',
    dir: config.jobsDir ?? join(configDir, 'scripts/jobs'),
  };
}

/** Run the `sync-jobs` command. */
export function syncJobsCommand(options: SyncCommandOptions): void {
  init({ workspacePath: options.workspace, configRoot: options.configRoot });

  const config = loadConfig(options.config);
  const source = selectSource(options, config);
  if (typeof source === 'string') {
    console.error(source);
    process.exit(1);
  }

  if (source.kind === 'legacy') {
    console.warn(
      'Warning: the jobsDir / --jobs-dir source is deprecated; use scriptsDir / --scripts-dir (jeeves-scripts).',
    );
    if (options.prune) {
      console.error('--prune requires the jeeves-scripts source');
      process.exit(1);
    }
  }

  const syncOptions = {
    dryRun: options.dryRun === true,
    resetEnabled: options.resetEnabled === true,
    prune: options.prune === true,
  };

  let result: SyncResult;
  try {
    result = withDb(config.dbPath, (db) =>
      source.kind === 'scripts'
        ? syncJobsFromScriptsDir(db, source.dir, syncOptions)
        : syncJobs(db, source.dir, syncOptions),
    );
  } catch (err) {
    if (err instanceof SyncFatalError) {
      console.error(`Sync aborted, nothing written: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  console.log(formatSyncReport(result));
  if (result.errors.length > 0) process.exit(1);
}
