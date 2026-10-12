/**
 * Sync job definitions into the runner database.
 *
 * Two sources:
 * - **jeeves-scripts** (`scriptsDir`, DD#61): runs
 *   `node <scriptsDir>/bin/jeeves-scripts.js list --json` and maps each
 *   entry with a manifest through the shared runner-core mapping (DD#62).
 * - **Legacy JSON files** (`jobsDir`, deprecated by DD#64); see
 *   {@link syncJobs}.
 *
 * Both sources share one plan/apply pipeline (`sync-plan.ts`):
 * - a field the source omits is left unchanged on update (DD#75);
 * - `enabled` is set only when a job is added, unless `resetEnabled`
 *   (DD#65, #103), and disagreements are reported as enabled drift;
 * - the source schedule is applied on every sync and each revert is
 *   reported (DD#66);
 * - `prerequisite` is informational only and is printed when a job is
 *   added (DD#76);
 * - orphans (launcher jobs no longer listed) are reported, and disabled
 *   (never deleted) only with `prune` (DD#69, DD#70);
 * - `dryRun` computes and reports the plan without writing (DD#68).
 *
 * @module
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  getLauncherPath,
  manifestEntryToJob,
  type ScriptsListEntry,
  scriptsListSchema,
} from '@karmaniverous/jeeves-runner-core';

import { runSync, scheduleError } from './sync-plan.js';
import {
  type DesiredJob,
  emptyResult,
  SyncFatalError,
  type SyncOptions,
  type SyncResult,
  toJson,
  type UpdatableColumn,
} from './sync-types.js';

export { syncJobs } from './sync-legacy.js';
export { formatSyncReport } from './sync-report.js';
export type {
  FieldDiff,
  SyncDetails,
  SyncOptions,
  SyncResult,
} from './sync-types.js';
export { SyncFatalError } from './sync-types.js';

/** Options for the jeeves-scripts source. */
export interface ScriptsSyncOptions extends SyncOptions {
  /**
   * Produce the raw `list --json` output for a scripts dir. Defaults to
   * {@link runScriptsList}; injectable for tests.
   */
  listRunner?: (scriptsDir: string) => string;
}

/** Default time allowed for `jeeves-scripts list --json` (cold start ~7s). */
const LIST_TIMEOUT_MS = 120_000;

/** Pick an error's stderr text when present. */
function stderrOf(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'stderr' in err) {
    const { stderr } = err;
    if (typeof stderr === 'string') return stderr.trim();
    if (Buffer.isBuffer(stderr)) return stderr.toString('utf-8').trim();
  }
  return '';
}

/**
 * Run `node <scriptsDir>/bin/jeeves-scripts.js list --json` with the
 * runner's own node and environment.
 *
 * @throws SyncFatalError on a non-zero exit or timeout.
 */
export function runScriptsList(
  scriptsDir: string,
  timeoutMs = LIST_TIMEOUT_MS,
): string {
  const launcher = getLauncherPath(scriptsDir);
  try {
    return execFileSync(process.execPath, [launcher, 'list', '--json'], {
      cwd: resolve(scriptsDir),
      encoding: 'utf-8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = stderrOf(err);
    const message = err instanceof Error ? err.message : String(err);
    throw new SyncFatalError(
      `jeeves-scripts list --json failed (${launcher}): ${message}${stderr ? `\n${stderr}` : ''}`,
    );
  }
}

/** Parse and validate raw `list --json` output (fatal on any failure). */
function parseScriptsList(raw: string): ScriptsListEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new SyncFatalError(
      `jeeves-scripts list --json produced unparseable JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const parsed = scriptsListSchema.safeParse(json);
  if (!parsed.success) {
    throw new SyncFatalError(
      `jeeves-scripts list --json output is invalid: ${parsed.error.message}`,
    );
  }

  const seen = new Set<string>();
  for (const entry of parsed.data) {
    if (seen.has(entry.id)) {
      throw new SyncFatalError(
        `jeeves-scripts list --json contains duplicate id '${entry.id}'`,
      );
    }
    seen.add(entry.id);
  }
  return parsed.data;
}

/** Manifest keys mapped to the column each one controls on update. */
const OPTIONAL_MANIFEST_COLUMNS: Array<[string, UpdatableColumn]> = [
  ['type', 'type'],
  ['description', 'description'],
  ['timeout_seconds', 'timeout_ms'],
  ['overlap_policy', 'overlap_policy'],
  ['env', 'env'],
  ['on_failure', 'on_failure'],
  ['on_success', 'on_success'],
];

/** Columns every manifest determines. */
const ALWAYS_PROVIDED: UpdatableColumn[] = [
  'name',
  'schedule',
  'script',
  'args',
  'source_type',
];

/**
 * Sync launcher jobs from a jeeves-scripts repo (DD#61).
 *
 * @throws SyncFatalError when `list --json` fails, is unparseable, is
 *   schema-invalid or contains a duplicate id; nothing is written.
 */
export function syncJobsFromScriptsDir(
  db: DatabaseSync,
  scriptsDir: string,
  options: ScriptsSyncOptions = {},
): SyncResult {
  const result = emptyResult(options.dryRun === true);
  const entries = parseScriptsList(
    (options.listRunner ?? runScriptsList)(scriptsDir),
  );

  const desired: DesiredJob[] = [];
  for (const entry of entries) {
    const job = manifestEntryToJob(entry, scriptsDir);
    if (!job || !entry.manifest) continue;

    const error = scheduleError(job.id, job.schedule);
    if (error) {
      result.errors.push(error);
      result.skipped++;
      continue;
    }

    const provided = new Set<UpdatableColumn>(ALWAYS_PROVIDED);
    for (const [key, column] of OPTIONAL_MANIFEST_COLUMNS) {
      if (key in entry.manifest) provided.add(column);
    }

    desired.push({
      id: job.id,
      row: {
        name: job.name,
        schedule: job.schedule,
        script: job.script,
        type: job.type,
        description: job.description,
        timeout_ms: job.timeout_ms,
        overlap_policy: job.overlap_policy,
        on_failure: job.on_failure,
        on_success: job.on_success,
        output_channel: null,
        source_type: 'path',
        env: toJson(job.env),
        args: toJson(job.args),
        enabled: job.enabled ? 1 : 0,
      },
      provided,
      prerequisite: job.prerequisite,
    });
  }

  return runSync(db, desired, options, result, scriptsDir);
}
