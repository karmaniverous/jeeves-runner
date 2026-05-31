/**
 * Sync job definitions from JSON files into the runner database.
 *
 * @module
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { validateSchedule } from '../../scheduler/schedule-utils.js';

/** Shape of a single job definition in a JSON file. */
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
  domain?: string;
  prerequisite?: string | null;
}

/** Result counts from a sync operation. */
export interface SyncResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Sync all job definitions from JSON files in `jobsDir` into the database.
 *
 * Each JSON file must contain an array of job objects. Script paths are
 * resolved relative to the parent of `jobsDir`.
 */
export function syncJobs(db: DatabaseSync, jobsDir: string): SyncResult {
  const resolvedDir = resolve(jobsDir);
  const scriptsRoot = resolve(resolvedDir, '..');
  const result: SyncResult = { added: 0, updated: 0, skipped: 0, errors: [] };

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

  // Track existing job IDs to determine add vs update
  const existingIds = new Set(
    (db.prepare('SELECT id FROM jobs').all() as Array<{ id: string }>).map(
      (r) => r.id,
    ),
  );

  const stmt = db.prepare(
    `INSERT INTO jobs
       (id, name, schedule, script, type, description, enabled, timeout_ms,
        overlap_policy, on_failure, on_success, output_channel, source_type, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       schedule = excluded.schedule,
       script = excluded.script,
       type = excluded.type,
       description = excluded.description,
       enabled = excluded.enabled,
       timeout_ms = excluded.timeout_ms,
       overlap_policy = excluded.overlap_policy,
       on_failure = excluded.on_failure,
       on_success = excluded.on_success,
       output_channel = excluded.output_channel,
       source_type = excluded.source_type,
       updated_at = datetime('now')`,
  );

  for (const file of files) {
    const filePath = join(resolvedDir, file);
    let jobs: unknown;

    try {
      jobs = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (err) {
      result.errors.push(
        `Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
      result.skipped++;
      continue;
    }

    if (!Array.isArray(jobs)) {
      result.errors.push(`${file}: expected an array of job definitions`);
      result.skipped++;
      continue;
    }

    for (const raw of jobs as unknown[]) {
      if (typeof raw !== 'object' || raw === null) {
        result.errors.push(`${file}: job entry is not an object`);
        result.skipped++;
        continue;
      }

      const obj = raw as Record<string, unknown>;
      if (
        typeof obj.id !== 'string' ||
        typeof obj.name !== 'string' ||
        typeof obj.script !== 'string' ||
        obj.schedule == null
      ) {
        result.errors.push(
          `${file}: job missing or has invalid required fields (id, name, script must be strings, schedule must be defined)`,
        );
        result.skipped++;
        continue;
      }

      const job = obj as unknown as JobDefinition;

      if (
        job.timeout_seconds != null &&
        typeof job.timeout_seconds !== 'number'
      ) {
        result.errors.push(
          `${file}: job '${job.id}' has invalid timeout_seconds (must be a number)`,
        );
        result.skipped++;
        continue;
      }

      if (job.enabled != null && typeof job.enabled !== 'boolean') {
        result.errors.push(
          `${file}: job '${job.id}' has invalid enabled field (must be a boolean)`,
        );
        result.skipped++;
        continue;
      }

      const scheduleStr =
        typeof job.schedule === 'object'
          ? JSON.stringify(job.schedule)
          : job.schedule;

      const validation = validateSchedule(scheduleStr);
      if (!validation.valid) {
        result.errors.push(
          `${file}: job '${job.id}' has invalid schedule: ${validation.error}`,
        );
        result.skipped++;
        continue;
      }

      const scriptPath =
        (job.source_type ?? 'path') === 'path'
          ? resolve(scriptsRoot, job.script)
          : job.script;
      const isUpdate = existingIds.has(job.id);

      stmt.run(
        job.id,
        job.name,
        scheduleStr,
        scriptPath,
        job.type ?? 'script',
        job.description ?? null,
        (job.enabled ?? true) ? 1 : 0,
        job.timeout_seconds != null ? job.timeout_seconds * 1000 : null,
        job.overlap_policy ?? 'skip',
        job.on_failure ?? null,
        job.on_success ?? null,
        job.output_channel ?? null,
        job.source_type ?? 'path',
      );

      if (isUpdate) {
        result.updated++;
      } else {
        result.added++;
        existingIds.add(job.id);
      }
    }
  }

  return result;
}
