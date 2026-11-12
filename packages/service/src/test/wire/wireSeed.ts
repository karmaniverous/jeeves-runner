/**
 * @module test/wire/wireSeed
 * Fixed rows for the wire baseline: two jobs, their runs, queue items and state, all with literal timestamps so every recorded body is stable. `resetWireDb` empties the tables and reseeds. Writes SQLite only.
 */

import type { DatabaseSync } from 'node:sqlite';

/** Tables the wire scenarios read or write, emptied on every reset. */
const TABLES = ['runs', 'jobs', 'queue_items', 'state_items', 'state'];

/** Seed rows, inserted with explicit timestamps. */
const SEED_SQL = `
INSERT INTO jobs (id, name, schedule, script, type, description, enabled, timeout_ms,
  overlap_policy, on_failure, on_success, created_at, updated_at, source_type,
  output_channel, env, args)
VALUES
  ('alpha', 'Alpha job', '0 * * * *', '/scripts/alpha.js', 'script', 'First job', 1, 60000,
   'skip', 'C-FAIL', NULL, '2026-01-01 00:00:00', '2026-01-02 00:00:00', 'path',
   NULL, '{"MODE":"wire"}', '["--fast"]'),
  ('beta', 'Beta job', '*/5 * * * *', 'console.log(1)', 'session', NULL, 0, NULL,
   'allow', NULL, 'C-OK', '2026-01-03 00:00:00', '2026-01-03 00:00:00', 'inline',
   'C-OUT', NULL, NULL);

INSERT INTO runs (job_id, status, started_at, finished_at, duration_ms, exit_code, tokens,
  result_meta, error, stdout_tail, stderr_tail, trigger)
VALUES
  ('alpha', 'ok', '2026-01-04 10:00:00', '2026-01-04 10:00:05', 5000, 0, NULL,
   NULL, NULL, 'done', '', 'schedule'),
  ('alpha', 'error', '2026-01-05 10:00:00', '2026-01-05 10:00:01', 1000, 1, 12,
   'meta', 'boom', '', 'boom', 'manual'),
  ('beta', 'running', '2026-01-06 10:00:00', NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, 'schedule');

INSERT INTO queue_items (queue_id, payload, status, priority, attempts, max_attempts, created_at)
VALUES
  ('work', '{"n":1}', 'pending', 0, 0, 1, '2026-01-01 00:00:00'),
  ('work', '{"n":2}', 'pending', 5, 0, 1, '2026-01-02 00:00:00'),
  ('work', '{"n":3}', 'processing', 0, 1, 1, '2026-01-01 00:00:00'),
  ('work', '{"n":4}', 'failed', 0, 1, 1, '2026-01-01 00:00:00'),
  ('other', '"text"', 'done', 0, 1, 1, '2026-01-01 00:00:00'),
  ('broken', 'not json', 'pending', 0, 0, 1, '2026-01-01 00:00:00');

INSERT INTO state (namespace, key, value, expires_at, updated_at)
VALUES
  ('email', 'lastPoll', '2026-01-01T00:00:00Z', NULL, '2026-01-01 00:00:00'),
  ('email', 'cursor', NULL, NULL, '2026-01-01 00:00:00'),
  ('email', 'gone', 'x', '2000-01-01 00:00:00', '2000-01-01 00:00:00'),
  ('email', 'threads', 'scalar', NULL, '2026-01-01 00:00:00'),
  ('x', 'seen', NULL, NULL, '2026-01-01 00:00:00');

INSERT INTO state_items (namespace, key, item_key, value, created_at, updated_at)
VALUES
  ('email', 'threads', 't1', '{"subject":"a"}', '2026-01-01 00:00:00', '2026-01-01 00:00:01'),
  ('email', 'threads', 't2', NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:02'),
  ('email', 'threads', 't3', 'plain', '2026-01-01 00:00:00', '2026-01-01 00:00:03'),
  ('x', 'seen', 'p1', '1', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
`;

/**
 * Empty the wire tables (and AUTOINCREMENT counters) and insert the seed.
 *
 * @param db - The wire app's database.
 */
export function resetWireDb(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
  db.exec('DELETE FROM sqlite_sequence');
  db.exec(SEED_SQL);
}

/**
 * Two runs started just now (one ok, one error) for the `status` health
 * counters; only scenarios that never print run timestamps add them.
 *
 * @param db - The wire app's database.
 */
export function addRecentRuns(db: DatabaseSync): void {
  db.exec(`
INSERT INTO runs (job_id, status, started_at, trigger) VALUES
  ('alpha', 'ok', datetime('now'), 'manual'),
  ('alpha', 'timeout', datetime('now'), 'schedule');
`);
}
