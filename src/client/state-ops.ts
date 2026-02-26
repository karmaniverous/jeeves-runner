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

/** State operations for scalar key-value state. */
export interface StateOps {
  getCursor(namespace: string, key: string): string | null;
  setCursor(
    namespace: string,
    key: string,
    value: string,
    options?: { ttl?: string },
  ): void;
  deleteCursor(namespace: string, key: string): void;
  getState(namespace: string, key: string): string | null;
  setState(
    namespace: string,
    key: string,
    value: string,
    options?: { ttl?: string },
  ): void;
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
}

/** Create state operations for the given database connection. */
export function createStateOps(db: DatabaseSync): StateOps {
  return {
    getCursor(namespace: string, key: string): string | null {
      const row = db
        .prepare(
          `SELECT value FROM state 
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
        ? `INSERT INTO state (namespace, key, value, expires_at) VALUES (?, ?, ?, ${expiresAt})
           ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = datetime('now')`
        : `INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)
           ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`;
      db.prepare(sql).run(namespace, key, value);
    },

    deleteCursor(namespace: string, key: string): void {
      db.prepare('DELETE FROM state WHERE namespace = ? AND key = ?').run(
        namespace,
        key,
      );
    },

    getState(namespace: string, key: string): string | null {
      return this.getCursor(namespace, key);
    },

    setState(
      namespace: string,
      key: string,
      value: string,
      options?: { ttl?: string },
    ): void {
      this.setCursor(namespace, key, value, options);
    },

    deleteState(namespace: string, key: string): void {
      this.deleteCursor(namespace, key);
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
  };
}
