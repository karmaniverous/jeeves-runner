/**
 * Job client library for runner jobs. Provides cursor (state) and queue operations. Opens its own DB connection via JR_DB_PATH env var.
 */

import type { DatabaseSync } from 'node:sqlite';

import { JSONPath } from 'jsonpath-plus';

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
  /** Add an item to a queue with optional priority and max attempts. Returns the queue item ID, or -1 if skipped due to deduplication. */
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
  /** Mark a queue item as failed with optional error message. Retries if under max_attempts, else dead-letters. */
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
      const payloadJson = JSON.stringify(payload);

      // Look up queue definition
      const queueDef = db
        .prepare(
          'SELECT dedup_expr, dedup_scope, max_attempts FROM queues WHERE id = ?',
        )
        .get(queue) as
        | {
            dedup_expr: string | null;
            dedup_scope: string;
            max_attempts: number;
          }
        | undefined;

      let dedupKey: string | null = null;
      const maxAttempts = options?.maxAttempts ?? queueDef?.max_attempts ?? 1;

      // Handle deduplication if queue definition exists and has dedup_expr
      if (queueDef?.dedup_expr) {
        try {
          const result: unknown = JSONPath({
            path: queueDef.dedup_expr,
            json: payload as object,
          });
          if (Array.isArray(result) && result.length > 0) {
            dedupKey = String(result[0]);
          }
        } catch {
          // If JSONPath evaluation fails, proceed without dedup
          dedupKey = null;
        }

        // Check for duplicates
        if (dedupKey) {
          const dedupScope = queueDef.dedup_scope || 'pending';
          const statusFilter =
            dedupScope === 'pending'
              ? "status IN ('pending', 'processing')"
              : "status IN ('pending', 'processing', 'done')";

          const existing = db
            .prepare(
              `SELECT id FROM queue_items 
               WHERE queue_id = ? AND dedup_key = ? AND ${statusFilter}
               LIMIT 1`,
            )
            .get(queue, dedupKey) as { id: number } | undefined;

          if (existing) {
            return -1; // Duplicate found, skip enqueue
          }
        }
      }

      // Insert the item
      const result = db
        .prepare(
          'INSERT INTO queue_items (queue_id, payload, priority, max_attempts, dedup_key) VALUES (?, ?, ?, ?, ?)',
        )
        .run(queue, payloadJson, priority, maxAttempts, dedupKey);
      return result.lastInsertRowid;
    },

    dequeue(queue: string, count = 1): QueueItem[] {
      // First, SELECT the items to claim (with correct ordering)
      const rows = db
        .prepare(
          `SELECT id, payload FROM queue_items 
           WHERE queue_id = ? AND status = 'pending' 
           ORDER BY priority DESC, created_at 
           LIMIT ?`,
        )
        .all(queue, count) as Array<{ id: number; payload: string }>;

      // Then UPDATE each one to claim it
      const updateStmt = db.prepare(
        `UPDATE queue_items 
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
        `UPDATE queue_items SET status = 'done', finished_at = datetime('now') WHERE id = ?`,
      ).run(queueItemId);
    },

    fail(queueItemId: number, error?: string): void {
      // Get current item state
      const item = db
        .prepare('SELECT attempts, max_attempts FROM queue_items WHERE id = ?')
        .get(queueItemId) as
        | { attempts: number; max_attempts: number }
        | undefined;

      if (!item) return;

      // If under max attempts, retry (reset to pending); else dead-letter (mark failed)
      if (item.attempts < item.max_attempts) {
        db.prepare(
          `UPDATE queue_items SET status = 'pending', error = ? WHERE id = ?`,
        ).run(error ?? null, queueItemId);
      } else {
        db.prepare(
          `UPDATE queue_items SET status = 'failed', finished_at = datetime('now'), error = ? WHERE id = ?`,
        ).run(error ?? null, queueItemId);
      }
    },

    close(): void {
      closeConnection(db);
    },
  };
}
