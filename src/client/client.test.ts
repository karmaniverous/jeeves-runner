/**
 * Tests for the runner client library (cursor and queue operations).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createClient } from './client.js';
import { createConnection, closeConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';

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
      rmSync(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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
  });
});
