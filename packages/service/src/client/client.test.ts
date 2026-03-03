/**
 * Tests for the runner client facade. Exercises client-specific behavior only:
 * connection management and delegation smoke tests.
 *
 * Exhaustive state/queue operation tests live in state-ops.test.ts and
 * queue-ops.test.ts (via routes.test.ts). This file intentionally avoids
 * re-testing those modules through the thin pass-through layer.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import { createClient } from './client.js';

describe('RunnerClient', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should throw when no dbPath and no env var', () => {
    const original = process.env.JR_DB_PATH;
    delete process.env.JR_DB_PATH;
    try {
      expect(() => createClient()).toThrow('DB path required');
    } finally {
      if (original !== undefined) process.env.JR_DB_PATH = original;
    }
  });

  it('should open and close without error', () => {
    const client = createClient(testDb.dbPath);
    expect(client).toBeDefined();
    client.close();
  });

  it('should delegate state ops (smoke)', () => {
    const client = createClient(testDb.dbPath);
    client.setState('ns', 'k', 'v');
    expect(client.getState('ns', 'k')).toBe('v');
    client.deleteState('ns', 'k');
    expect(client.getState('ns', 'k')).toBeNull();
    client.close();
  });

  it('should delegate collection ops (smoke)', () => {
    const client = createClient(testDb.dbPath);
    client.setItem('ns', 'k', 'item1', 'val');
    expect(client.hasItem('ns', 'k', 'item1')).toBe(true);
    expect(client.getItem('ns', 'k', 'item1')).toBe('val');
    client.deleteItem('ns', 'k', 'item1');
    expect(client.hasItem('ns', 'k', 'item1')).toBe(false);
    client.close();
  });

  it('should delegate queue ops (smoke)', () => {
    const client = createClient(testDb.dbPath);
    // Enqueue without a queue definition � tests basic insert
    const id = client.enqueue('test-queue', { data: 'hello' });
    expect(id).toBeGreaterThan(0);
    const items = client.dequeue('test-queue', 1);
    expect(items).toHaveLength(1);
    expect(items[0].payload).toEqual({ data: 'hello' });
    client.done(items[0].id);
    client.close();
  });
});
