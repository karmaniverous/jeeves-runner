/**
 * Job client library for runner jobs. Provides cursor (state) and queue operations. Opens its own DB connection via JR_DB_PATH env var.
 */

import type { DatabaseSync } from 'node:sqlite';

import { JSONPath } from 'jsonpath-plus';

import { closeConnection, createConnection } from '../db/connection.js';
import { createCollectionOps, createStateOps } from './state-ops.js';

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
  /** Retrieve a state value by namespace and key (alias for getCursor). Returns null if not found or expired. */
  getState(namespace: string, key: string): string | null;
  /** Set or update a state value with optional TTL (alias for setCursor). */
  setState(
    namespace: string,
    key: string,
    value: string,
    options?: { ttl?: string },
  ): void;
  /** Delete a state value by namespace and key (alias for deleteCursor). */
  deleteState(namespace: string, key: string): void;
  /** Check if a state item exists in a collection. */
  hasItem(namespace: string, key: string, itemKey: string): boolean;
  /** Retrieve a state item value from a collection. Returns null if not found. */
  getItem(namespace: string, key: string, itemKey: string): string | null;
  /** Set or update a state item in a collection. Value is optional (for existence-only tracking). Auto-creates parent state row if needed. */
  setItem(
    namespace: string,
    key: string,
    itemKey: string,
    value?: string,
  ): void;
  /** Delete a state item from a collection. */
  deleteItem(namespace: string, key: string, itemKey: string): void;
  /** Count state items in a collection. */
  countItems(namespace: string, key: string): number;
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
  const stateOps = createStateOps(db);
  const collectionOps = createCollectionOps(db);

  return {
    ...stateOps,
    ...collectionOps,

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
      // Wrap SELECT + UPDATE in a transaction for atomicity
      db.exec('BEGIN');

      try {
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

        db.exec('COMMIT');

        return rows.map((row) => ({
          id: row.id,
          payload: JSON.parse(row.payload) as unknown,
        }));
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
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
