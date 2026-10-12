/**
 * Legacy `jobsDir` source for `sync-jobs`: `*.json` arrays of job
 * definitions (deprecated by DD#64; removed in the next major).
 *
 * @module
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { runSync, scheduleError } from './sync-plan.js';
import {
  type DesiredJob,
  emptyResult,
  type SyncOptions,
  type SyncResult,
  toJson,
  UPDATABLE_COLUMNS,
  type UpdatableColumn,
} from './sync-types.js';

/** Shape of a single job definition in a legacy JSON file. */
interface JobDefinition {
  id: string;
  name: string;
  script: string;
  schedule: string | Record<string, unknown>;
  description?: string;
  overlap_policy?: 'skip' | 'allow';
  timeout_seconds?: number;
  enabled?: boolean;
  type?: 'script' | 'session';
  on_failure?: string | null;
  on_success?: string | null;
  output_channel?: string | null;
  source_type?: 'path' | 'inline';
  /** Forward-compatibility stub (DD#43); not persisted. */
  domain?: string;
  /** Informational only (DD#76); not persisted. */
  prerequisite?: string | null;
  env?: Record<string, string>;
  args?: string[];
}

/** Legacy JSON key for each updatable column. */
const LEGACY_KEYS: Record<UpdatableColumn, keyof JobDefinition> = {
  name: 'name',
  schedule: 'schedule',
  script: 'script',
  type: 'type',
  description: 'description',
  timeout_ms: 'timeout_seconds',
  overlap_policy: 'overlap_policy',
  on_failure: 'on_failure',
  on_success: 'on_success',
  output_channel: 'output_channel',
  source_type: 'source_type',
  env: 'env',
  args: 'args',
};

/** Validate one legacy entry; return the definition or an error message. */
function validateLegacyEntry(
  file: string,
  raw: unknown,
): JobDefinition | string {
  if (typeof raw !== 'object' || raw === null) {
    return `${file}: job entry is not an object`;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    typeof obj.name !== 'string' ||
    typeof obj.script !== 'string' ||
    obj.schedule == null
  ) {
    return `${file}: job missing or has invalid required fields (id, name, script must be strings, schedule must be defined)`;
  }
  const job = obj as unknown as JobDefinition;
  if (job.timeout_seconds != null && typeof job.timeout_seconds !== 'number') {
    return `${file}: job '${job.id}' has invalid timeout_seconds (must be a number)`;
  }
  if (job.enabled != null && typeof job.enabled !== 'boolean') {
    return `${file}: job '${job.id}' has invalid enabled field (must be a boolean)`;
  }
  return job;
}

/** Build the desired job for a validated legacy definition. */
function toDesiredJob(
  job: JobDefinition,
  schedule: string,
  scriptsRoot: string,
): DesiredJob {
  const sourceType = job.source_type ?? 'path';
  return {
    id: job.id,
    row: {
      name: job.name,
      schedule,
      script:
        sourceType === 'path' ? resolve(scriptsRoot, job.script) : job.script,
      type: job.type ?? 'script',
      description: job.description ?? null,
      timeout_ms:
        job.timeout_seconds != null ? job.timeout_seconds * 1000 : null,
      overlap_policy: job.overlap_policy ?? 'skip',
      on_failure: job.on_failure ?? null,
      on_success: job.on_success ?? null,
      output_channel: job.output_channel ?? null,
      source_type: sourceType,
      env: toJson(job.env),
      args: toJson(job.args),
      enabled: (job.enabled ?? true) ? 1 : 0,
    },
    provided: new Set(UPDATABLE_COLUMNS.filter((c) => LEGACY_KEYS[c] in job)),
    prerequisite: job.prerequisite ?? null,
  };
}

/**
 * Sync job definitions from legacy JSON files in `jobsDir`.
 *
 * Each JSON file must contain an array of job objects. Script paths are
 * resolved relative to the parent of `jobsDir`. Fields a definition omits
 * are left unchanged on update (DD#75).
 */
export function syncJobs(
  db: DatabaseSync,
  jobsDir: string,
  options: SyncOptions = {},
): SyncResult {
  const resolvedDir = resolve(jobsDir);
  const scriptsRoot = resolve(resolvedDir, '..');
  const result = emptyResult(options.dryRun === true);

  /** Record a skipped entry. */
  function skip(message: string): void {
    result.errors.push(message);
    result.skipped++;
  }

  let files: string[];
  try {
    files = readdirSync(resolvedDir).filter((f) => f.endsWith('.json'));
  } catch {
    result.errors.push(`Cannot read jobs directory: ${resolvedDir}`);
    return result;
  }

  if (files.length === 0) {
    console.log(`No JSON files found in ${resolvedDir}`);
    return result;
  }

  const desired: DesiredJob[] = [];
  for (const file of files) {
    let jobs: unknown;
    try {
      jobs = JSON.parse(readFileSync(join(resolvedDir, file), 'utf-8'));
    } catch (err) {
      skip(
        `Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    if (!Array.isArray(jobs)) {
      skip(`${file}: expected an array of job definitions`);
      continue;
    }

    for (const raw of jobs as unknown[]) {
      const job = validateLegacyEntry(file, raw);
      if (typeof job === 'string') {
        skip(job);
        continue;
      }

      const schedule =
        typeof job.schedule === 'object'
          ? JSON.stringify(job.schedule)
          : job.schedule;
      const error = scheduleError(job.id, schedule);
      if (error) {
        skip(`${file}: ${error}`);
        continue;
      }

      desired.push(toDesiredJob(job, schedule, scriptsRoot));
    }
  }

  return runSync(db, desired, options, result);
}
