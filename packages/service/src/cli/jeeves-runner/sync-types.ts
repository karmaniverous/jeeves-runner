/**
 * Shared types and helpers for `sync-jobs`.
 *
 * @module
 */

import type { JobField } from '@karmaniverous/jeeves-runner-core';

/** Columns a sync may write on update (all but `enabled`). */
export const UPDATABLE_COLUMNS = [
  'name',
  'schedule',
  'script',
  'type',
  'description',
  'timeout_ms',
  'overlap_policy',
  'on_failure',
  'on_success',
  'output_channel',
  'source_type',
  'env',
  'args',
] as const;

/** A column a sync may write on update. */
export type UpdatableColumn = (typeof UPDATABLE_COLUMNS)[number];

/** Stored representation of a job row (as written to SQLite). */
export type JobRow = Record<UpdatableColumn, string | number | null> & {
  enabled: number;
};

/** A job as the source wants it. */
export interface DesiredJob {
  /** Job id. */
  id: string;
  /** Full row used when the job is added (defaults applied). */
  row: JobRow;
  /** Columns the source specifies; only these are written on update (DD#75). */
  provided: ReadonlySet<UpdatableColumn>;
  /** Informational prerequisite text (DD#76). */
  prerequisite: string | null;
}

/** A job definition from any source, with defaults already applied. */
export interface JobInput {
  /** Job id. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Stored schedule string. */
  schedule: string;
  /** Script path or inline source. */
  script: string;
  /** Script arguments, or `null`. */
  args: string[] | null;
  /** Job type. */
  type: 'script' | 'session';
  /** Description, or `null`. */
  description: string | null;
  /** Timeout in milliseconds, or `null`. */
  timeout_ms: number | null;
  /** Overlap policy. */
  overlap_policy: 'skip' | 'allow';
  /** Per-job environment, or `null`. */
  env: Record<string, string> | null;
  /** Failure channel, or `null`. */
  on_failure: string | null;
  /** Success channel, or `null`. */
  on_success: string | null;
  /** Output channel, or `null`. */
  output_channel: string | null;
  /** Whether `script` is a path or inline source. */
  source_type: 'path' | 'inline';
  /** Enabled state for a newly added job. */
  enabled: boolean;
  /** Informational prerequisite text, or `null` (DD#76). */
  prerequisite: string | null;
  /** Fields the source specifies; only these are written on update. */
  specified: ReadonlyArray<JobField | 'output_channel' | 'source_type'>;
}

/** Convert a job definition to the row and update set the sync writes. */
export function toDesiredJob(input: JobInput): DesiredJob {
  return {
    id: input.id,
    row: {
      name: input.name,
      schedule: input.schedule,
      script: input.script,
      type: input.type,
      description: input.description,
      timeout_ms: input.timeout_ms,
      overlap_policy: input.overlap_policy,
      on_failure: input.on_failure,
      on_success: input.on_success,
      output_channel: input.output_channel,
      source_type: input.source_type,
      env: toJson(input.env),
      args: toJson(input.args),
      enabled: input.enabled ? 1 : 0,
    },
    provided: new Set(input.specified),
    prerequisite: input.prerequisite,
  };
}

/** Options shared by both sync sources. */
export interface SyncOptions {
  /** Compute and report the plan without writing anything (DD#68). */
  dryRun?: boolean;
  /** Overwrite `enabled` on update with the source value (DD#65). */
  resetEnabled?: boolean;
  /** Disable orphaned launcher jobs; scripts source only (DD#69). */
  prune?: boolean;
}

/** A field change on an updated job. */
export interface FieldDiff {
  /** Column name. */
  column: string;
  /** Stored value before the sync. */
  from: string | number | null;
  /** Value written by the sync. */
  to: string | number | null;
}

/** Detailed outcome of a sync. */
export interface SyncDetails {
  /** Added jobs, with their informational prerequisite. */
  added: Array<{ id: string; prerequisite: string | null }>;
  /** Updated jobs and their field diffs. */
  updated: Array<{ id: string; diffs: FieldDiff[] }>;
  /** Ids of jobs whose stored values already match. */
  unchanged: string[];
  /** Jobs whose source `enabled` differs from the stored value. */
  enabledDrift: Array<{
    id: string;
    source: boolean;
    stored: boolean;
    reset: boolean;
  }>;
  /** Schedules the sync reverted to the source schedule (DD#66). */
  scheduleReverts: Array<{ id: string; from: string; to: string }>;
  /** Launcher jobs no longer listed by the source. */
  orphans: Array<{ id: string; enabled: boolean; disabled: boolean }>;
}

/** Result of a sync operation. */
export interface SyncResult {
  /** Number of jobs added. */
  added: number;
  /** Number of jobs updated. */
  updated: number;
  /** Number of jobs already up to date. */
  unchanged: number;
  /** Number of entries skipped because of an error. */
  skipped: number;
  /** Error messages (each one a skipped entry). */
  errors: string[];
  /** Whether nothing was written. */
  dryRun: boolean;
  /** Detailed outcome. */
  details: SyncDetails;
}

/** A failure that aborts the whole sync with nothing written (DD#63). */
export class SyncFatalError extends Error {
  /** Create a fatal sync error. */
  constructor(message: string) {
    super(message);
    this.name = 'SyncFatalError';
  }
}

/** Create an empty result. */
export function emptyResult(dryRun: boolean): SyncResult {
  return {
    added: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    dryRun,
    details: {
      added: [],
      updated: [],
      unchanged: [],
      enabledDrift: [],
      scheduleReverts: [],
      orphans: [],
    },
  };
}

/** Record an entry skipped because of an error. */
export function recordSkip(result: SyncResult, message: string): void {
  result.errors.push(message);
  result.skipped++;
}

/** Message text of an unknown thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** JSON-encode an optional value for storage. */
function toJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}
