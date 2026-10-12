/**
 * `jeeves-runner sync-jobs` command.
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
  type ScriptsSyncOptions,
  SyncFatalError,
  syncJobs,
  syncJobsFromScriptsDir,
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
}

/** Commander options for the `sync-jobs` action. */
interface SyncActionOptions extends SyncCommandOptions {
  /** Workspace root path. */
  workspace: string;
  /** Platform config root path. */
  configRoot: string;
}

/** Console-like output sink (injectable for tests). */
export interface SyncOutput {
  /** Normal output. */
  log: (message: string) => void;
  /** Warnings. */
  warn: (message: string) => void;
  /** Errors. */
  error: (message: string) => void;
}

/** Test seams for {@link runSyncCommand}. */
export interface SyncCommandDeps {
  /** Output sink; defaults to `console`. */
  out?: SyncOutput;
  /** Override for producing `list --json` output. */
  listRunner?: ScriptsSyncOptions['listRunner'];
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

/**
 * Run a sync and report it.
 *
 * @returns The process exit code.
 */
export function runSyncCommand(
  options: SyncCommandOptions,
  deps: SyncCommandDeps = {},
): number {
  const out = deps.out ?? console;
  const config = loadConfig(options.config);
  const source = selectSource(options, config);
  if (typeof source === 'string') {
    out.error(source);
    return 1;
  }

  if (source.kind === 'legacy') {
    out.warn(
      'Warning: the jobsDir / --jobs-dir source is deprecated; use scriptsDir / --scripts-dir (jeeves-scripts).',
    );
    if (options.prune) {
      out.error('--prune requires the jeeves-scripts source');
      return 1;
    }
  }

  const syncOptions = {
    dryRun: options.dryRun === true,
    resetEnabled: options.resetEnabled === true,
    prune: options.prune === true,
  };

  try {
    const result = withDb(config.dbPath, (db) =>
      source.kind === 'scripts'
        ? syncJobsFromScriptsDir(db, source.dir, {
            ...syncOptions,
            listRunner: deps.listRunner,
          })
        : syncJobs(db, source.dir, syncOptions),
    );
    out.log(formatSyncReport(result));
    return result.errors.length > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof SyncFatalError) {
      out.error(`Sync aborted, nothing written: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

/** Commander action for `sync-jobs`. */
export function syncJobsCommand(options: SyncActionOptions): void {
  init({ workspacePath: options.workspace, configRoot: options.configRoot });
  const code = runSyncCommand(options);
  if (code !== 0) process.exit(code);
}
