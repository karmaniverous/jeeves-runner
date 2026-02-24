/**
 * Schema migration runner. Tracks applied migrations via schema_version table, applies pending migrations idempotently.
 */

import type { DatabaseSync } from 'node:sqlite';

/** Initial schema migration SQL (embedded to avoid runtime file resolution issues). */
const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    schedule        TEXT NOT NULL,
    script          TEXT NOT NULL,
    type            TEXT DEFAULT 'script',
    description     TEXT,
    enabled         INTEGER DEFAULT 1,
    timeout_ms      INTEGER,
    overlap_policy  TEXT DEFAULT 'skip',
    on_failure      TEXT,
    on_success      TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL REFERENCES jobs(id),
    status          TEXT NOT NULL,
    started_at      TEXT,
    finished_at     TEXT,
    duration_ms     INTEGER,
    exit_code       INTEGER,
    tokens          INTEGER,
    result_meta     TEXT,
    error           TEXT,
    stdout_tail     TEXT,
    stderr_tail     TEXT,
    trigger         TEXT DEFAULT 'schedule'
);

CREATE INDEX IF NOT EXISTS idx_runs_job_started ON runs(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

CREATE TABLE IF NOT EXISTS cursors (
    namespace       TEXT NOT NULL,
    key             TEXT NOT NULL,
    value           TEXT,
    expires_at      TEXT,
    updated_at      TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (namespace, key)
);

CREATE INDEX IF NOT EXISTS idx_cursors_expires ON cursors(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS queues (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    queue           TEXT NOT NULL,
    payload         TEXT NOT NULL,
    status          TEXT DEFAULT 'pending',
    priority        INTEGER DEFAULT 0,
    attempts        INTEGER DEFAULT 0,
    max_attempts    INTEGER DEFAULT 1,
    error           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    claimed_at      TEXT,
    finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_queues_poll ON queues(queue, status, priority DESC, created_at);
`;

/** Registry of all migrations keyed by version number. */
const MIGRATIONS: Record<number, string> = {
  1: MIGRATION_001,
};

/**
 * Run all pending migrations. Creates schema_version table if needed, applies migrations in order.
 */
export function runMigrations(db: DatabaseSync): void {
  // Create schema_version table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Get current version
  const currentVersionRow = db
    .prepare('SELECT MAX(version) as version FROM schema_version')
    .get() as { version: number | null } | undefined;
  const currentVersion = currentVersionRow?.version ?? 0;

  // Apply pending migrations
  const pendingVersions = Object.keys(MIGRATIONS)
    .map(Number)
    .filter((v) => v > currentVersion)
    .sort((a, b) => a - b);

  for (const version of pendingVersions) {
    db.exec(MIGRATIONS[version]);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
  }
}
