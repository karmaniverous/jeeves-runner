/**
 * Job client library for runner jobs. Provides cursor (state) and queue operations. Opens its own DB connection via JR_DB_PATH env var.
 */

import type { DatabaseSync } from 'node:sqlite';

import { closeConnection, createConnection } from '../db/connection.js';
import type { QueueItem } from './queue-ops.js';
import { createQueueOps } from './queue-ops.js';
import { createCollectionOps, createStateOps } from './state-ops.js';

export type { QueueItem };

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
  const queueOps = createQueueOps(db);

  return {
    ...stateOps,
    ...collectionOps,
    ...queueOps,

    close(): void {
      closeConnection(db);
    },
  };
}
