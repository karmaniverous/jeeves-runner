/**
 * `jeeves-runner sync-jobs` command.
 *
 * Source precedence, highest first: the `--scripts-dir` or `--jobs-dir`
 * flag (not both); config `scriptsDir`; legacy config `jobsDir`; the legacy
 * default `configDir/scripts/jobs`. The legacy source prints a deprecation
 * warning (DD#64).
 *
 * The config is found by {@link resolveForCommand} (DD#81): `-c`, else
 * `{configRoot}/jeeves-runner/config.json`; no config means exit 1. A dry
 * run opens the database read-only and never creates or migrates it
 * (DD#82).
 *
 * Exit codes: 0 when clean (non-null prerequisites included, DD#76);
 * 1 when any entry is skipped for an error, the sync is fatal (DD#63), no
 * config is found, or a dry run finds no usable database.
 *
 * @module
 */

import { dirname, join } from 'node:path';

import { ReadOnlyDbError, withDb, withReadOnlyDb } from './config-helpers.js';
import {
  type CommandDiagnostics,
  type ConfigOptions,
  type ResolvedRunnerConfig,
  resolveForCommand,
  stderrDiagnostics,
} from './resolve-config.js';
import {
  formatSyncReport,
  type ScriptsSyncOptions,
  SyncFatalError,
  syncJobs,
  syncJobsFromScriptsDir,
} from './sync-jobs.js';

/** Parsed `sync-jobs` options. */
export interface SyncCommandOptions extends ConfigOptions {
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

/** Output sink (injectable for tests): stdout for the report, stderr for the rest. */
export interface SyncOutput extends CommandDiagnostics {
  /** Normal output. */
  log: (message: string) => void;
  /** Warnings. */
  warn: (message: string) => void;
}

const defaultOut: SyncOutput = {
  ...stderrDiagnostics,
  log: (message) => {
    console.log(message);
  },
  warn: (message) => {
    console.warn(message);
  },
};

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
  { config, configPath }: ResolvedRunnerConfig,
): SyncSource | string {
  if (options.scriptsDir && options.jobsDir) {
    return '--scripts-dir and --jobs-dir cannot be used together';
  }
  if (options.scriptsDir) return { kind: 'scripts', dir: options.scriptsDir };
  if (options.jobsDir) return { kind: 'legacy', dir: options.jobsDir };
  if (config.scriptsDir) return { kind: 'scripts', dir: config.scriptsDir };

  return {
    kind: 'legacy',
    dir: config.jobsDir ?? join(dirname(configPath), 'scripts/jobs'),
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
  const out = deps.out ?? defaultOut;
  const resolved = resolveForCommand(options, out);
  if (!resolved) return 1;
  const source = selectSource(options, resolved);
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

  // A dry run must not create, migrate or write the database (DD#82).
  const open = syncOptions.dryRun ? withReadOnlyDb : withDb;

  try {
    const result = open(resolved.dbPath, (db) =>
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
    if (err instanceof ReadOnlyDbError) {
      out.error(err.message);
      return 1;
    }
    throw err;
  }
}

/** Commander action for `sync-jobs`. */
export function syncJobsCommand(options: SyncCommandOptions): void {
  const code = runSyncCommand(options);
  if (code !== 0) process.exit(code);
}
