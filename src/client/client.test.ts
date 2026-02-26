/**
 * Tests for the runner client library (cursor and queue operations).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeConnection, createConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { createClient } from './client.js';

describe('RunnerClient', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'jeeves-runner-test-'));
    dbPath = join(testDir, 'test.db');
    const db = createConnection(dbPath);
    runMigrations(db);
    closeConnection(db);
  });

  afterEach(() => {
    // Windows can have file locks from WAL mode, retry a few times
    try {
      rmSync(testDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  describe('Cursors', () => {
    it('should set and get a cursor', () => {
      const client = createClient(dbPath);
      client.setCursor('test', 'key1', 'value1');
      expect(client.getCursor('test', 'key1')).toBe('value1');
      client.close();
    });

    it('should return null for non-existent cursor', () => {
      const client = createClient(dbPath);
      expect(client.getCursor('test', 'missing')).toBeNull();
      client.close();
    });

    it('should delete a cursor', () => {
      const client = createClient(dbPath);
      client.setCursor('test', 'key1', 'value1');
      expect(client.getCursor('test', 'key1')).toBe('value1');
      client.deleteCursor('test', 'key1');
      expect(client.getCursor('test', 'missing')).toBeNull();
      client.close();
    });

    it('should update an existing cursor', () => {
      const client = createClient(dbPath);
      client.setCursor('test', 'key1', 'value1');
      client.setCursor('test', 'key1', 'value2');
      expect(client.getCursor('test', 'key1')).toBe('value2');
      client.close();
    });

    it('should set a cursor with TTL', () => {
      const client = createClient(dbPath);
      client.setCursor('test', 'key1', 'value1', { ttl: '1d' });
      expect(client.getCursor('test', 'key1')).toBe('value1');
      client.close();
    });
  });

  describe('State', () => {
    it('should set and get a state value', () => {
      const client = createClient(dbPath);
      client.setState('test', 'key1', 'value1');
      expect(client.getState('test', 'key1')).toBe('value1');
      client.close();
    });

    it('should return null for non-existent state', () => {
      const client = createClient(dbPath);
      expect(client.getState('test', 'missing')).toBeNull();
      client.close();
    });

    it('should delete a state value', () => {
      const client = createClient(dbPath);
      client.setState('test', 'key1', 'value1');
      expect(client.getState('test', 'key1')).toBe('value1');
      client.deleteState('test', 'key1');
      expect(client.getState('test', 'key1')).toBeNull();
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

    it('should be compatible with cursor methods (same storage)', () => {
      const client = createClient(dbPath);
      // Set via cursor API
      client.setCursor('test', 'key1', 'value1');
      // Get via state API
      expect(client.getState('test', 'key1')).toBe('value1');
      // Update via state API
      client.setState('test', 'key1', 'value2');
      // Get via cursor API
      expect(client.getCursor('test', 'key1')).toBe('value2');
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
  });
});
