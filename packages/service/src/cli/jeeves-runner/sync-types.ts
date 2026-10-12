/**
 * Shared types and helpers for `sync-jobs`.
 *
 * @module
 */

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

/** JSON-encode an optional value for storage. */
export function toJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}
