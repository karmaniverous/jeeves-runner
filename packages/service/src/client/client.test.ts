/**
 * Tests for the runner client library (state and queue operations).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeConnection, createConnection } from '../db/connection.js';
import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import { createClient } from './client.js';

describe('RunnerClient', () => {
  let testDb: TestDb;
  let dbPath: string;

  beforeEach(() => {
    testDb = createTestDb();
    dbPath = testDb.dbPath;
  });

  afterEach(() => {
    testDb.cleanup();
  });

  describe('State', () => {
    it('should set and get a state value', () => {
      const client = createClient(dbPath);
      client.setState('test', 'key1', 'value1');
      expect(client.getState('test', 'key1')).toBe('value1');
      client.close();
    });

    it('should return null for non-existent state value', () => {
      const client = createClient(dbPath);
      expect(client.getState('test', 'missing')).toBeNull();
      client.close();
    });

    it('should delete a state value', () => {
      const client = createClient(dbPath);
      client.setState('test', 'key1', 'value1');
      expect(client.getState('test', 'key1')).toBe('value1');
      client.deleteState('test', 'key1');
      expect(client.getState('test', 'missing')).toBeNull();
      client.close();
    });

    it('should update an existing state value', () => {
      const client = createClient(dbPath);
      client.setState('test', 'key1', 'value1');
      client.setState('test', 'key1', 'value2');
      expect(client.getState('test', 'key1')).toBe('value2');
      client.close();
    });

    it('should set a state value with TTL', () => {
      const client = createClient(dbPath);
      client.setState('test', 'key1', 'value1', { ttl: '1d' });
      expect(client.getState('test', 'key1')).toBe('value1');
      client.close();
    });
  });

  describe('State Items', () => {
    it('should set item and hasItem returns true', () => {
      const client = createClient(dbPath);
      client.setItem('test', 'key1', 'item1', 'value1');
      expect(client.hasItem('test', 'key1', 'item1')).toBe(true);
      client.close();
    });

    it('should return false for missing item', () => {
      const client = createClient(dbPath);
      expect(client.hasItem('test', 'key1', 'missing')).toBe(false);
      client.close();
    });

    it('should set and get item value', () => {
      const client = createClient(dbPath);
      client.setItem('test', 'key1', 'item1', 'value1');
      expect(client.getItem('test', 'key1', 'item1')).toBe('value1');
      client.close();
    });

    it('should set item with no value (existence-only)', () => {
      const client = createClient(dbPath);
      client.setItem('test', 'key1', 'item1');
      expect(client.hasItem('test', 'key1', 'item1')).toBe(true);
      expect(client.getItem('test', 'key1', 'item1')).toBeNull();
      client.close();
    });

    it('should delete item', () => {
      const client = createClient(dbPath);
      client.setItem('test', 'key1', 'item1', 'value1');
      expect(client.hasItem('test', 'key1', 'item1')).toBe(true);
      client.deleteItem('test', 'key1', 'item1');
      expect(client.hasItem('test', 'key1', 'item1')).toBe(false);
      client.close();
    });

    it('should count items in empty collection', () => {
      const client = createClient(dbPath);
      expect(client.countItems('test', 'empty-key')).toBe(0);
      client.close();
    });

    it('should count items in collection', () => {
      const client = createClient(dbPath);
      client.setItem('test', 'key1', 'item1', 'value1');
      client.setItem('test', 'key1', 'item2', 'value2');
      client.setItem('test', 'key1', 'item3', 'value3');
      expect(client.countItems('test', 'key1')).toBe(3);
      client.close();
    });

    it('should overwrite item (upsert)', () => {
      const client = createClient(dbPath);
      client.setItem('test', 'key1', 'item1', 'value1');
      expect(client.getItem('test', 'key1', 'item1')).toBe('value1');
      client.setItem('test', 'key1', 'item1', 'value2');
      expect(client.getItem('test', 'key1', 'item1')).toBe('value2');
      client.close();
    });

    it('should isolate collections by namespace and key', () => {
      const client = createClient(dbPath);
      client.setItem('ns1', 'key1', 'item1', 'value1');
      client.setItem('ns2', 'key1', 'item1', 'value2');
      expect(client.getItem('ns1', 'key1', 'item1')).toBe('value1');
      expect(client.getItem('ns2', 'key1', 'item1')).toBe('value2');
      client.close();
    });

    it('should auto-create parent state row', () => {
      const client = createClient(dbPath);
      // Verify parent doesn't exist
      expect(client.getState('test', 'new-key')).toBeNull();
      // Set item (should auto-create parent)
      client.setItem('test', 'new-key', 'item1', 'value1');
      // Verify parent now exists
      expect(client.getState('test', 'new-key')).toBeNull(); // value is NULL
      expect(client.hasItem('test', 'new-key', 'item1')).toBe(true);
      client.close();
    });
  });

  describe('pruneItems', () => {
    it('should prune to keepCount newest items', () => {
      const client = createClient(dbPath);
      const db = createConnection(dbPath);

      // Insert 10 items with distinct updated_at
      for (let i = 0; i < 10; i++) {
        const ts = `2026-01-01T00:00:${String(i).padStart(2, '0')}`;
        db.prepare(
          `INSERT OR IGNORE INTO state (namespace, key, value) VALUES ('test', 'prune-key', NULL)`,
        ).run();
        db.prepare(
          `INSERT INTO state_items (namespace, key, item_key, value, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run('test', 'prune-key', `item-${String(i)}`, `val-${String(i)}`, ts);
      }

      const deleted = client.pruneItems('test', 'prune-key', 5);
      expect(deleted).toBe(5);
      expect(client.countItems('test', 'prune-key')).toBe(5);

      // Verify the 5 newest remain (items 5-9)
      for (let i = 5; i < 10; i++) {
        expect(client.hasItem('test', 'prune-key', `item-${String(i)}`)).toBe(
          true,
        );
      }
      for (let i = 0; i < 5; i++) {
        expect(client.hasItem('test', 'prune-key', `item-${String(i)}`)).toBe(
          false,
        );
      }

      closeConnection(db);
      client.close();
    });

    it('should not delete when keepCount >= actual count', () => {
      const client = createClient(dbPath);
      client.setItem('test', 'prune-key', 'item-0', 'val');
      client.setItem('test', 'prune-key', 'item-1', 'val');

      const deleted = client.pruneItems('test', 'prune-key', 10);
      expect(deleted).toBe(0);
      expect(client.countItems('test', 'prune-key')).toBe(2);
      client.close();
    });
  });

  describe('listItemKeys', () => {
    it('should return keys in desc order by default', () => {
      const client = createClient(dbPath);
      const db = createConnection(dbPath);

      db.prepare(
        `INSERT OR IGNORE INTO state (namespace, key, value) VALUES ('test', 'list-key', NULL)`,
      ).run();
      for (let i = 0; i < 3; i++) {
        const ts = `2026-01-01T00:00:${String(i).padStart(2, '0')}`;
        db.prepare(
          `INSERT INTO state_items (namespace, key, item_key, value, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run('test', 'list-key', `item-${String(i)}`, null, ts);
      }

      const keys = client.listItemKeys('test', 'list-key');
      expect(keys).toEqual(['item-2', 'item-1', 'item-0']);

      closeConnection(db);
      client.close();
    });

    it('should respect limit option', () => {
      const client = createClient(dbPath);
      const db = createConnection(dbPath);

      db.prepare(
        `INSERT OR IGNORE INTO state (namespace, key, value) VALUES ('test', 'list-key2', NULL)`,
      ).run();
      for (let i = 0; i < 5; i++) {
        const ts = `2026-01-01T00:00:${String(i).padStart(2, '0')}`;
        db.prepare(
          `INSERT INTO state_items (namespace, key, item_key, value, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run('test', 'list-key2', `item-${String(i)}`, null, ts);
      }

      const keys = client.listItemKeys('test', 'list-key2', { limit: 2 });
      expect(keys).toEqual(['item-4', 'item-3']);

      closeConnection(db);
      client.close();
    });
  });

  describe('Queues', () => {
    it('should enqueue and dequeue items', () => {
      const client = createClient(dbPath);
      const id = client.enqueue('test-queue', { foo: 'bar' });
      expect(id).toBeGreaterThan(0);

      const items = client.dequeue('test-queue', 1);
      expect(items).toHaveLength(1);
      expect(items[0]?.payload).toEqual({ foo: 'bar' });
      client.close();
    });

    it('should respect priority order', () => {
      const client = createClient(dbPath);
      client.enqueue('test-queue', { order: 1 }, { priority: 0 });
      client.enqueue('test-queue', { order: 2 }, { priority: 10 });
      client.enqueue('test-queue', { order: 3 }, { priority: 5 });

      const items = client.dequeue('test-queue', 3);
      expect(items).toHaveLength(3);
      expect((items[0]?.payload as { order: number }).order).toBe(2);
      expect((items[1]?.payload as { order: number }).order).toBe(3);
      expect((items[2]?.payload as { order: number }).order).toBe(1);
      client.close();
    });

    it('should mark items as done', () => {
      const client = createClient(dbPath);
      const id = client.enqueue('test-queue', { foo: 'bar' });
      client.dequeue('test-queue', 1);
      client.done(id);

      // Item should not be dequeued again
      const items = client.dequeue('test-queue', 1);
      expect(items).toHaveLength(0);
      client.close();
    });

    it('should mark items as failed', () => {
      const client = createClient(dbPath);
      const id = client.enqueue('test-queue', { foo: 'bar' });
      client.dequeue('test-queue', 1);
      client.fail(id, 'Something went wrong');

      // Item should not be dequeued again
      const items = client.dequeue('test-queue', 1);
      expect(items).toHaveLength(0);
      client.close();
    });

    it('should return empty array when queue is empty', () => {
      const client = createClient(dbPath);
      const items = client.dequeue('empty-queue', 10);
      expect(items).toHaveLength(0);
      client.close();
    });

    it('should deduplicate items with dedup_expr (pending scope)', () => {
      const client = createClient(dbPath);
      // email-pending queue has dedup_expr = '$.threadId' and scope = 'pending'
      const id1 = client.enqueue('email-pending', {
        threadId: 'thread-123',
        message: 'First',
      });
      expect(id1).toBeGreaterThan(0);

      // Second enqueue with same threadId should be skipped
      const id2 = client.enqueue('email-pending', {
        threadId: 'thread-123',
        message: 'Second',
      });
      expect(id2).toBe(-1);

      // After marking first as done, should be able to enqueue again
      const items = client.dequeue('email-pending', 1);
      client.done(items[0].id);

      const id3 = client.enqueue('email-pending', {
        threadId: 'thread-123',
        message: 'Third',
      });
      expect(id3).toBeGreaterThan(0);

      client.close();
    });

    it('should deduplicate items with dedup_expr (all scope)', () => {
      const client = createClient(dbPath);
      const db = createConnection(dbPath);

      // Create a test queue with 'all' scope
      db.prepare(
        `INSERT INTO queues (id, name, dedup_expr, dedup_scope, max_attempts, retention_days) 
         VALUES ('test-all-scope', 'Test All Scope', '$.id', 'all', 1, 7)`,
      ).run();

      const id1 = client.enqueue('test-all-scope', { id: 'item-1' });
      expect(id1).toBeGreaterThan(0);

      // Mark as done
      const items = client.dequeue('test-all-scope', 1);
      client.done(items[0].id);

      // Should still be deduplicated because scope is 'all'
      const id2 = client.enqueue('test-all-scope', { id: 'item-1' });
      expect(id2).toBe(-1);

      closeConnection(db);
      client.close();
    });

    it('should retry failed items under max_attempts', () => {
      const client = createClient(dbPath);
      const db = createConnection(dbPath);

      // Create a test queue with max_attempts = 3
      db.prepare(
        `INSERT INTO queues (id, name, max_attempts, retention_days) 
         VALUES ('test-retry', 'Test Retry', 3, 7)`,
      ).run();

      const id = client.enqueue('test-retry', { foo: 'bar' });
      expect(id).toBeGreaterThan(0);

      // First attempt: dequeue and fail
      let items = client.dequeue('test-retry', 1);
      expect(items).toHaveLength(1);
      client.fail(items[0].id, 'First failure');

      // Should be back in pending (retry)
      items = client.dequeue('test-retry', 1);
      expect(items).toHaveLength(1);
      client.fail(items[0].id, 'Second failure');

      // Should still be pending (retry)
      items = client.dequeue('test-retry', 1);
      expect(items).toHaveLength(1);
      client.fail(items[0].id, 'Third failure');

      // Now at max_attempts, should be dead-lettered (no more retries)
      items = client.dequeue('test-retry', 1);
      expect(items).toHaveLength(0);

      closeConnection(db);
      client.close();
    });

    it('should support backward compat: enqueue to undefined queue', () => {
      const client = createClient(dbPath);
      // Queue not defined in queues table, should still work
      const id = client.enqueue('undefined-queue', { test: 'data' });
      expect(id).toBeGreaterThan(0);

      const items = client.dequeue('undefined-queue', 1);
      expect(items).toHaveLength(1);
      expect(items[0]?.payload).toEqual({ test: 'data' });

      client.close();
    });

    it('should use transaction for atomic dequeue', () => {
      const client = createClient(dbPath);
      const db = createConnection(dbPath);

      // Enqueue two items
      client.enqueue('test-queue', { id: 1 });
      client.enqueue('test-queue', { id: 2 });

      // Verify both are pending before dequeue
      const pendingBefore = db
        .prepare(
          `SELECT COUNT(*) as count FROM queue_items WHERE queue_id = 'test-queue' AND status = 'pending'`,
        )
        .get() as { count: number };
      expect(pendingBefore.count).toBe(2);

      // Dequeue one item
      const items = client.dequeue('test-queue', 1);
      expect(items).toHaveLength(1);

      // Verify exactly one is now processing and one is still pending
      const processingAfter = db
        .prepare(
          `SELECT COUNT(*) as count FROM queue_items WHERE queue_id = 'test-queue' AND status = 'processing'`,
        )
        .get() as { count: number };
      const pendingAfter = db
        .prepare(
          `SELECT COUNT(*) as count FROM queue_items WHERE queue_id = 'test-queue' AND status = 'pending'`,
        )
        .get() as { count: number };

      expect(processingAfter.count).toBe(1);
      expect(pendingAfter.count).toBe(1);

      closeConnection(db);
      client.close();
    });
  });
});
