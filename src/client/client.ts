/**
 * Job client library for runner jobs. Provides cursor (state) and queue operations. Opens its own DB connection via JR_DB_PATH env var.
 */

import type { DatabaseSync } from 'node:sqlite';

import { closeConnection, createConnection } from '../db/connection.js';

/** Queue item returned from dequeue operation. */
export interface QueueItem {
  /** Queue item unique identifier. */
  id: number;
  /** Queue item payload (deserialized from JSON). */
  payload: unknown;
}

/** Client interface for job scripts to interact with runner state and queues. */
export interface RunnerClient {
  /** Retrieve a cursor value by namespace and key. Returns null if not found or expired. */
  getCursor(namespace: string, key: string): string | null;
  /** Set or update a cursor value with optional TTL (e.g., '30d', '24h', '60m'). */
  setCursor(
    namespace: string,
    key: string,
    value: string,
    options?: { ttl?: string },
  ): void;
  /** Delete a cursor by namespace and key. */
  deleteCursor(namespace: string, key: string): void;
  /** Add an item to a queue with optional priority and max attempts. Returns the queue item ID. */
  enqueue(
    queue: string,
    payload: unknown,
    options?: { priority?: number; maxAttempts?: number },
  ): number;
  /**
   * Claim and retrieve items from a queue for processing. Returns array of queue items with id and payload.
   * @param queue - Queue name
   * @param count - Number of items to dequeue (default 1)
   */
  dequeue(queue: string, count?: number): QueueItem[];
  /** Mark a queue item as successfully completed. */
  done(queueItemId: number): void;
  /** Mark a queue item as failed with optional error message. */
  fail(queueItemId: number, error?: string): void;
  /** Close the database connection. */
  close(): void;
}

/** Parse TTL string (e.g., '30d', '24h', '60m') into ISO datetime offset from now. */
function parseTtl(ttl: string): string {
  const match = /^(\d+)([dhm])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL format: ${ttl}`);

  const amount = match[1];
  const unit = match[2];
  if (!amount || !unit) throw new Error(`Invalid TTL format: ${ttl}`);

  const num = parseInt(amount, 10);

  let modifier: string;
  switch (unit) {
    case 'd':
      modifier = `+${String(num)} days`;
      break;
    case 'h':
      modifier = `+${String(num)} hours`;
      break;
    case 'm':
      modifier = `+${String(num)} minutes`;
      break;
    default:
      throw new Error(`Unknown TTL unit: ${unit}`);
  }

  return `datetime('now', '${modifier}')`;
}

/**
 * Create a runner client for job scripts. Opens its own DB connection.
 */
export function createClient(dbPath?: string): RunnerClient {
  const path = dbPath ?? process.env.JR_DB_PATH;
  if (!path)
    throw new Error(
      'DB path required (provide dbPath or set JR_DB_PATH env var)',
    );

  const db: DatabaseSync = createConnection(path);

  return {
    getCursor(namespace: string, key: string): string | null {
      const row = db
        .prepare(
          `SELECT value FROM cursors 
           WHERE namespace = ? AND key = ? 
           AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        )
        .get(namespace, key) as { value: string } | undefined;
      return row?.value ?? null;
    },

    setCursor(
      namespace: string,
      key: string,
      value: string,
      options?: { ttl?: string },
    ): void {
      const expiresAt = options?.ttl ? parseTtl(options.ttl) : null;
      const sql = expiresAt
        ? `INSERT INTO cursors (namespace, key, value, expires_at) VALUES (?, ?, ?, ${expiresAt})
           ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = datetime('now')`
        : `INSERT INTO cursors (namespace, key, value) VALUES (?, ?, ?)
           ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`;
      db.prepare(sql).run(namespace, key, value);
    },

    deleteCursor(namespace: string, key: string): void {
      db.prepare('DELETE FROM cursors WHERE namespace = ? AND key = ?').run(
        namespace,
        key,
      );
    },

    enqueue(
      queue: string,
      payload: unknown,
      options?: { priority?: number; maxAttempts?: number },
    ): number {
      const priority = options?.priority ?? 0;
      const maxAttempts = options?.maxAttempts ?? 1;
      const payloadJson = JSON.stringify(payload);
      const result = db
        .prepare(
          'INSERT INTO queues (queue, payload, priority, max_attempts) VALUES (?, ?, ?, ?)',
        )
        .run(queue, payloadJson, priority, maxAttempts);
      return result.lastInsertRowid;
    },

    dequeue(queue: string, count = 1): QueueItem[] {
      // First, SELECT the items to claim (with correct ordering)
      const rows = db
        .prepare(
          `SELECT id, payload FROM queues 
           WHERE queue = ? AND status = 'pending' 
           ORDER BY priority DESC, created_at 
           LIMIT ?`,
        )
        .all(queue, count) as Array<{ id: number; payload: string }>;

      // Then UPDATE each one to claim it
      const updateStmt = db.prepare(
        `UPDATE queues 
         SET status = 'processing', claimed_at = datetime('now'), attempts = attempts + 1
         WHERE id = ?`,
      );

      for (const row of rows) {
        updateStmt.run(row.id);
      }

      return rows.map((row) => ({
        id: row.id,
        payload: JSON.parse(row.payload) as unknown,
      }));
    },

    done(queueItemId: number): void {
      db.prepare(
        `UPDATE queues SET status = 'done', finished_at = datetime('now') WHERE id = ?`,
      ).run(queueItemId);
    },

    fail(queueItemId: number, error?: string): void {
      db.prepare(
        `UPDATE queues SET status = 'failed', finished_at = datetime('now'), error = ? WHERE id = ?`,
      ).run(error ?? null, queueItemId);
    },

    close(): void {
      closeConnection(db);
    },
  };
}
