/**
 * Plan/apply pipeline shared by both `sync-jobs` sources.
 *
 * @module
 */

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import {
  isLauncherScript,
  normalizeScriptPath,
} from '@karmaniverous/jeeves-runner-core';

import {
  getNextFireTime,
  validateSchedule,
} from '../../scheduler/schedule-utils.js';
import {
  type DesiredJob,
  type FieldDiff,
  type JobRow,
  type SyncDetails,
  type SyncOptions,
  type SyncResult,
  UPDATABLE_COLUMNS,
} from './sync-types.js';

/** Validate a schedule; return an error message or `null`. */
export function scheduleError(id: string, schedule: string): string | null {
  const validation = validateSchedule(schedule);
  if (!validation.valid) {
    return `job '${id}' has invalid schedule: ${validation.error}`;
  }
  if (!getNextFireTime(schedule)) {
    return `job '${id}' has a valid schedule that produces no upcoming fire time — job will never run`;
  }
  return null;
}

/** Read stored rows for every job. */
function readStoredJobs(db: DatabaseSync): Map<string, JobRow> {
  const rows = db
    .prepare(`SELECT id, enabled, ${UPDATABLE_COLUMNS.join(', ')} FROM jobs`)
    .all() as unknown as Array<JobRow & { id: string }>;
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Whether a stored value already matches the source value. Path scripts
 * compare after normalisation (DD#70), so `J:/x` and `J:\x` are equal.
 */
function sameValue(
  column: string,
  from: string | number | null,
  to: string | number | null,
  sourceType: string | number | null,
): boolean {
  if (from === to) return true;
  if (
    column === 'script' &&
    sourceType === 'path' &&
    typeof from === 'string' &&
    typeof to === 'string'
  ) {
    return normalizeScriptPath(from) === normalizeScriptPath(to);
  }
  return false;
}

/** A pending column assignment. */
type ColumnSet = [string, SQLInputValue];

/** Pending writes computed by {@link planSync}. */
interface SyncPlan {
  inserts: DesiredJob[];
  updates: Array<{ id: string; sets: ColumnSet[] }>;
  disables: string[];
}

/** Compare one desired job with its stored row; record details. */
function planUpdate(
  job: DesiredJob,
  current: JobRow,
  options: SyncOptions,
  details: SyncDetails,
): ColumnSet[] {
  const sets: ColumnSet[] = [];
  const diffs: FieldDiff[] = [];
  for (const column of UPDATABLE_COLUMNS) {
    if (!job.provided.has(column)) continue;
    const to = job.row[column];
    const from = current[column];
    if (sameValue(column, from, to, job.row.source_type)) continue;
    sets.push([column, to]);
    diffs.push({ column, from, to });
    if (column === 'schedule') {
      details.scheduleReverts.push({
        id: job.id,
        from: String(from),
        to: String(to),
      });
    }
  }

  const storedEnabled = current.enabled === 1;
  const sourceEnabled = job.row.enabled === 1;
  if (storedEnabled !== sourceEnabled) {
    const reset = options.resetEnabled === true;
    details.enabledDrift.push({
      id: job.id,
      source: sourceEnabled,
      stored: storedEnabled,
      reset,
    });
    if (reset) {
      sets.push(['enabled', job.row.enabled]);
      diffs.push({
        column: 'enabled',
        from: current.enabled,
        to: job.row.enabled,
      });
    }
  }

  if (sets.length > 0) details.updated.push({ id: job.id, diffs });
  else details.unchanged.push(job.id);
  return sets;
}

/**
 * Compare desired jobs with stored jobs and fill in `result`.
 *
 * @param orphans - Launcher and listed ids for orphan detection, or
 *   `undefined` for the legacy source (no orphan detection).
 */
function planSync(
  db: DatabaseSync,
  desired: DesiredJob[],
  options: SyncOptions,
  result: SyncResult,
  orphans?: OrphanScope,
): SyncPlan {
  const stored = readStoredJobs(db);
  const plan: SyncPlan = { inserts: [], updates: [], disables: [] };
  const { details } = result;

  for (const job of desired) {
    const current = stored.get(job.id);
    if (!current) {
      plan.inserts.push(job);
      details.added.push({ id: job.id, prerequisite: job.prerequisite });
      continue;
    }
    const sets = planUpdate(job, current, options, details);
    if (sets.length > 0) plan.updates.push({ id: job.id, sets });
  }

  if (orphans !== undefined) {
    for (const [id, row] of stored) {
      if (orphans.listedIds.has(id)) continue;
      if (!isLauncherScript(String(row.script), orphans.launcherDir)) continue;
      const enabled = row.enabled === 1;
      const disable = options.prune === true && enabled;
      details.orphans.push({ id, enabled, disabled: disable });
      if (disable) plan.disables.push(id);
    }
  }

  result.added = details.added.length;
  result.updated = details.updated.length;
  result.unchanged = details.unchanged.length;
  return plan;
}

/** Write a plan in one transaction; roll back on any failure. */
function applyPlan(db: DatabaseSync, plan: SyncPlan): void {
  const insert = db.prepare(
    `INSERT INTO jobs
       (id, enabled, ${UPDATABLE_COLUMNS.join(', ')}, updated_at)
     VALUES (?, ?, ${UPDATABLE_COLUMNS.map(() => '?').join(', ')}, datetime('now'))`,
  );
  const disable = db.prepare(
    "UPDATE jobs SET enabled = 0, updated_at = datetime('now') WHERE id = ?",
  );

  db.exec('BEGIN');
  try {
    for (const job of plan.inserts) {
      insert.run(
        job.id,
        job.row.enabled,
        ...UPDATABLE_COLUMNS.map((c) => job.row[c]),
      );
    }
    for (const { id, sets } of plan.updates) {
      db.prepare(
        `UPDATE jobs SET ${sets.map(([c]) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ).run(...sets.map(([, v]) => v), id);
    }
    for (const id of plan.disables) disable.run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Orphan detection scope. `listedIds` holds every id the source lists,
 * including entries skipped for an error, so a listed job is never
 * treated as an orphan.
 */
export interface OrphanScope {
  /** Scripts dir whose launcher identifies candidate orphans. */
  launcherDir: string;
  /** Every id the source lists. */
  listedIds: ReadonlySet<string>;
}

/** Plan, then apply unless dry-run. */
export function runSync(
  db: DatabaseSync,
  desired: DesiredJob[],
  options: SyncOptions,
  result: SyncResult,
  orphans?: OrphanScope,
): SyncResult {
  const plan = planSync(db, desired, options, result, orphans);
  if (!options.dryRun) applyPlan(db, plan);
  return result;
}
