/**
 * Tests for state operations module.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import { createCollectionOps, createStateOps, parseTtl } from './state-ops.js';

describe('parseTtl', () => {
  it('should parse days and return ISO datetime', () => {
    const before = Date.now();
    const result = parseTtl('30d');
    const after = Date.now();
    const parsed = new Date(result).getTime();
    const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
    expect(parsed).toBeGreaterThanOrEqual(expectedMin - 1000);
    expect(parsed).toBeLessThanOrEqual(expectedMax + 1000);
  });

  it('should parse hours and return ISO datetime', () => {
    const before = Date.now();
    const result = parseTtl('24h');
    const after = Date.now();
    const parsed = new Date(result).getTime();
    const expectedMin = before + 24 * 60 * 60 * 1000;
    const expectedMax = after + 24 * 60 * 60 * 1000;
    expect(parsed).toBeGreaterThanOrEqual(expectedMin - 1000);
    expect(parsed).toBeLessThanOrEqual(expectedMax + 1000);
  });

  it('should parse minutes and return ISO datetime', () => {
    const before = Date.now();
    const result = parseTtl('60m');
    const after = Date.now();
    const parsed = new Date(result).getTime();
    const expectedMin = before + 60 * 60 * 1000;
    const expectedMax = after + 60 * 60 * 1000;
    expect(parsed).toBeGreaterThanOrEqual(expectedMin - 1000);
    expect(parsed).toBeLessThanOrEqual(expectedMax + 1000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseTtl('invalid')).toThrow('Invalid TTL format');
  });

  it('should throw on unknown unit', () => {
    expect(() => parseTtl('30x')).toThrow('Invalid TTL format');
  });
});

describe('StateOps', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should get and set cursor', () => {
    const ops = createStateOps(testDb.db);
    ops.setCursor('test', 'key1', 'value1');
    expect(ops.getCursor('test', 'key1')).toBe('value1');
  });

  it('should delete cursor', () => {
    const ops = createStateOps(testDb.db);
    ops.setCursor('test', 'key1', 'value1');
    ops.deleteCursor('test', 'key1');
    expect(ops.getCursor('test', 'key1')).toBeNull();
  });

  it('should get and set state (aliases)', () => {
    const ops = createStateOps(testDb.db);
    ops.setState('test', 'key1', 'value1');
    expect(ops.getState('test', 'key1')).toBe('value1');
  });

  it('should return null for expired state', () => {
    const ops = createStateOps(testDb.db);
    // Set a state with TTL in the past (simulate expiry by direct SQL)
    testDb.db
      .prepare(
        `INSERT INTO state (namespace, key, value, expires_at) VALUES (?, ?, ?, datetime('now', '-1 minute'))`,
      )
      .run('test', 'expired-key', 'value');
    expect(ops.getState('test', 'expired-key')).toBeNull();
  });
});

describe('CollectionOps', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should set and check item existence', () => {
    const ops = createCollectionOps(testDb.db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    expect(ops.hasItem('test', 'key1', 'item1')).toBe(true);
  });

  it('should get item value', () => {
    const ops = createCollectionOps(testDb.db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    expect(ops.getItem('test', 'key1', 'item1')).toBe('value1');
  });

  it('should delete item', () => {
    const ops = createCollectionOps(testDb.db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    ops.deleteItem('test', 'key1', 'item1');
    expect(ops.hasItem('test', 'key1', 'item1')).toBe(false);
  });

  it('should count items', () => {
    const ops = createCollectionOps(testDb.db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    ops.setItem('test', 'key1', 'item2', 'value2');
    expect(ops.countItems('test', 'key1')).toBe(2);
  });
});
