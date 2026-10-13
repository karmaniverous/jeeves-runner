/**
 * Legacy `jobsDir` source for `sync-jobs`: `*.json` arrays of job
 * definitions (deprecated by DD#64; removed in the next major).
 *
 * @module
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  type JobField,
  specifiedJobFields,
} from '@karmaniverous/jeeves-runner-core';

import { runSync, scheduleError } from './sync-plan.js';
import {
  type DesiredJob,
  emptyResult,
  errorMessage,
  type JobInput,
  recordSkip,
  type SyncOptions,
  type SyncResult,
  toDesiredJob,
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

/** Fields every legacy definition sets (required keys). */
const LEGACY_ALWAYS_SET: readonly JobField[] = ['name', 'schedule', 'script'];

/** Legacy-only keys that also count as specified when present. */
const LEGACY_EXTRA_KEYS = ['args', 'output_channel', 'source_type'] as const;

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
function legacyDesiredJob(
  job: JobDefinition,
  schedule: string,
  scriptsRoot: string,
): DesiredJob {
  const sourceType = job.source_type ?? 'path';
  const specified: JobInput['specified'] = [
    ...specifiedJobFields(job, LEGACY_ALWAYS_SET),
    ...LEGACY_EXTRA_KEYS.filter((key) => key in job),
  ];
  return toDesiredJob({
    id: job.id,
    name: job.name,
    schedule,
    script:
      sourceType === 'path' ? resolve(scriptsRoot, job.script) : job.script,
    args: job.args ?? null,
    type: job.type ?? 'script',
    description: job.description ?? null,
    timeout_ms: job.timeout_seconds != null ? job.timeout_seconds * 1000 : null,
    overlap_policy: job.overlap_policy ?? 'skip',
    env: job.env ?? null,
    on_failure: job.on_failure ?? null,
    on_success: job.on_success ?? null,
    output_channel: job.output_channel ?? null,
    source_type: sourceType,
    enabled: job.enabled ?? true,
    prerequisite: job.prerequisite ?? null,
    specified,
  });
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
  const skip = (message: string): void => {
    recordSkip(result, message);
  };

  let files: string[];
  try {
    files = readdirSync(resolvedDir).filter((f) => f.endsWith('.json'));
  } catch {
    recordSkip(result, `Cannot read jobs directory: ${resolvedDir}`);
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
      skip(`Failed to parse ${file}: ${errorMessage(err)}`);
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

      desired.push(legacyDesiredJob(job, schedule, scriptsRoot));
    }
  }

  return runSync(db, desired, options, result);
}
