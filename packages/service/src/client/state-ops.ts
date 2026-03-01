/**
 * State operations module for runner client. Provides scalar state (key-value) and collection state (grouped items).
 */

import type { DatabaseSync } from 'node:sqlite';

/** Parse TTL string (e.g., '30d', '24h', '60m') into ISO datetime offset from now. */
export function parseTtl(ttl: string): string {
  const match = /^(\d+)([dhm])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL format: ${ttl}`);

  const amount = match[1];
  const unit = match[2];
  if (!amount || !unit) throw new Error(`Invalid TTL format: ${ttl}`);

  const num = parseInt(amount, 10);

  let ms: number;
  switch (unit) {
    case 'd':
      ms = num * 24 * 60 * 60 * 1000;
      break;
    case 'h':
      ms = num * 60 * 60 * 1000;
      break;
    case 'm':
      ms = num * 60 * 1000;
      break;
    default:
      throw new Error(`Unknown TTL unit: ${unit}`);
  }

  return new Date(Date.now() + ms).toISOString();
}

/** State operations for scalar key-value state. */
export interface StateOps {
  /** Retrieve a state value by namespace and key. Returns null if not found or expired. */
  getState(namespace: string, key: string): string | null;
  /** Set or update a state value with optional TTL (e.g., '30d', '24h', '60m'). */
  setState(
    namespace: string,
    key: string,
    value: string,
    options?: { ttl?: string },
  ): void;
  /** Delete a state value by namespace and key. */
  deleteState(namespace: string, key: string): void;
}

/** Collection state operations for managing grouped items. */
export interface CollectionOps {
  hasItem(namespace: string, key: string, itemKey: string): boolean;
  getItem(namespace: string, key: string, itemKey: string): string | null;
  setItem(
    namespace: string,
    key: string,
    itemKey: string,
    value?: string,
  ): void;
  deleteItem(namespace: string, key: string, itemKey: string): void;
  countItems(namespace: string, key: string): number;
  pruneItems(namespace: string, key: string, keepCount: number): number;
  listItemKeys(
    namespace: string,
    key: string,
    options?: { limit?: number; order?: 'asc' | 'desc' },
  ): string[];
}

/** Create state operations for the given database connection. */
export function createStateOps(db: DatabaseSync): StateOps {
  return {
    getState(namespace: string, key: string): string | null {
      const row = db
        .prepare(
          `SELECT value FROM state 
           WHERE namespace = ? AND key = ? 
           AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        )
        .get(namespace, key) as { value: string } | undefined;
      return row?.value ?? null;
    },

    setState(
      namespace: string,
      key: string,
      value: string,
      options?: { ttl?: string },
    ): void {
      const expiresAt = options?.ttl ? parseTtl(options.ttl) : null;
      if (expiresAt) {
        db.prepare(
          `INSERT INTO state (namespace, key, value, expires_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = datetime('now')`,
        ).run(namespace, key, value, expiresAt);
      } else {
        db.prepare(
          `INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)
           ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        ).run(namespace, key, value);
      }
    },

    deleteState(namespace: string, key: string): void {
      db.prepare('DELETE FROM state WHERE namespace = ? AND key = ?').run(
        namespace,
        key,
      );
    },
  };
}

/** Create collection state operations for the given database connection. */
export function createCollectionOps(db: DatabaseSync): CollectionOps {
  return {
    hasItem(namespace: string, key: string, itemKey: string): boolean {
      const row = db
        .prepare(
          'SELECT 1 FROM state_items WHERE namespace = ? AND key = ? AND item_key = ?',
        )
        .get(namespace, key, itemKey) as { 1: number } | undefined;
      return row !== undefined;
    },

    getItem(namespace: string, key: string, itemKey: string): string | null {
      const row = db
        .prepare(
          'SELECT value FROM state_items WHERE namespace = ? AND key = ? AND item_key = ?',
        )
        .get(namespace, key, itemKey) as { value: string | null } | undefined;
      return row?.value ?? null;
    },

    setItem(
      namespace: string,
      key: string,
      itemKey: string,
      value?: string,
    ): void {
      // Auto-create parent state row if it doesn't exist
      db.prepare(
        `INSERT OR IGNORE INTO state (namespace, key, value) VALUES (?, ?, NULL)`,
      ).run(namespace, key);
      db.prepare(
        `INSERT INTO state_items (namespace, key, item_key, value) VALUES (?, ?, ?, ?)
         ON CONFLICT(namespace, key, item_key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      ).run(namespace, key, itemKey, value ?? null);
    },

    deleteItem(namespace: string, key: string, itemKey: string): void {
      db.prepare(
        'DELETE FROM state_items WHERE namespace = ? AND key = ? AND item_key = ?',
      ).run(namespace, key, itemKey);
    },

    countItems(namespace: string, key: string): number {
      const row = db
        .prepare(
          'SELECT COUNT(*) as count FROM state_items WHERE namespace = ? AND key = ?',
        )
        .get(namespace, key) as { count: number } | undefined;
      return row?.count ?? 0;
    },

    pruneItems(namespace: string, key: string, keepCount: number): number {
      const result = db
        .prepare(
          `DELETE FROM state_items WHERE namespace = ? AND key = ? AND rowid NOT IN (SELECT rowid FROM state_items WHERE namespace = ? AND key = ? ORDER BY updated_at DESC LIMIT ?)`,
        )
        .run(namespace, key, namespace, key, keepCount);
      return result.changes;
    },

    listItemKeys(
      namespace: string,
      key: string,
      options?: { limit?: number; order?: 'asc' | 'desc' },
    ): string[] {
      const order = options?.order === 'asc' ? 'ASC' : 'DESC';
      const limitClause = options?.limit
        ? ` LIMIT ${String(options.limit)}`
        : '';
      const rows = db
        .prepare(
          `SELECT item_key FROM state_items WHERE namespace = ? AND key = ? ORDER BY updated_at ${order}${limitClause}`,
        )
        .all(namespace, key) as Array<{ item_key: string }>;
      return rows.map((r) => r.item_key);
    },
  };
}
