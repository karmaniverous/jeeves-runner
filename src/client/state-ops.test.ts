/**
 * Tests for state operations module.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeConnection, createConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { createCollectionOps, createStateOps, parseTtl } from './state-ops.js';

describe('parseTtl', () => {
  it('should parse days', () => {
    const result = parseTtl('30d');
    expect(result).toBe("datetime('now', '+30 days')");
  });

  it('should parse hours', () => {
    const result = parseTtl('24h');
    expect(result).toBe("datetime('now', '+24 hours')");
  });

  it('should parse minutes', () => {
    const result = parseTtl('60m');
    expect(result).toBe("datetime('now', '+60 minutes')");
  });

  it('should throw on invalid format', () => {
    expect(() => parseTtl('invalid')).toThrow('Invalid TTL format');
  });

  it('should throw on unknown unit', () => {
    expect(() => parseTtl('30x')).toThrow('Invalid TTL format');
  });
});

describe('StateOps', () => {
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

  it('should get and set cursor', () => {
    const db = createConnection(dbPath);
    const ops = createStateOps(db);
    ops.setCursor('test', 'key1', 'value1');
    expect(ops.getCursor('test', 'key1')).toBe('value1');
    closeConnection(db);
  });

  it('should delete cursor', () => {
    const db = createConnection(dbPath);
    const ops = createStateOps(db);
    ops.setCursor('test', 'key1', 'value1');
    ops.deleteCursor('test', 'key1');
    expect(ops.getCursor('test', 'key1')).toBeNull();
    closeConnection(db);
  });

  it('should get and set state (aliases)', () => {
    const db = createConnection(dbPath);
    const ops = createStateOps(db);
    ops.setState('test', 'key1', 'value1');
    expect(ops.getState('test', 'key1')).toBe('value1');
    closeConnection(db);
  });
});

describe('CollectionOps', () => {
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

  it('should set and check item existence', () => {
    const db = createConnection(dbPath);
    const ops = createCollectionOps(db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    expect(ops.hasItem('test', 'key1', 'item1')).toBe(true);
    closeConnection(db);
  });

  it('should get item value', () => {
    const db = createConnection(dbPath);
    const ops = createCollectionOps(db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    expect(ops.getItem('test', 'key1', 'item1')).toBe('value1');
    closeConnection(db);
  });

  it('should delete item', () => {
    const db = createConnection(dbPath);
    const ops = createCollectionOps(db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    ops.deleteItem('test', 'key1', 'item1');
    expect(ops.hasItem('test', 'key1', 'item1')).toBe(false);
    closeConnection(db);
  });

  it('should count items', () => {
    const db = createConnection(dbPath);
    const ops = createCollectionOps(db);
    ops.setItem('test', 'key1', 'item1', 'value1');
    ops.setItem('test', 'key1', 'item2', 'value2');
    expect(ops.countItems('test', 'key1')).toBe(2);
    closeConnection(db);
  });
});
