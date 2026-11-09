/**
 * Concurrency tests for `dequeue` against a real second writer (#126).
 * The competing connections live in worker threads: `node:sqlite` is
 * synchronous, so only another thread can release a lock while the test
 * connection waits on it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import {
  startConsumer,
  startWriteHolder,
} from '../test-utils/sqlite-workers.js';
import { createQueueOps } from './queue-ops.js';

const QUEUE = 'concurrency';

function seed(testDb: TestDb, count: number): void {
  const ops = createQueueOps(testDb.db);
  for (let i = 0; i < count; i++) ops.enqueue(QUEUE, { i });
}

function attemptsById(testDb: TestDb): Map<number, number> {
  const rows = testDb.db
    .prepare('SELECT id, attempts FROM queue_items WHERE queue_id = ?')
    .all(QUEUE) as Array<{ id: number; attempts: number }>;
  return new Map(rows.map((r) => [r.id, r.attempts]));
}

describe('dequeue with a competing writer', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('waits for a writer that commits within busy_timeout, then claims', async () => {
    seed(testDb, 3);
    const holder = await startWriteHolder(testDb.dbPath, 300);

    // Blocks this thread until the holder commits (busy_timeout = 5000).
    const items = createQueueOps(testDb.db).dequeue(QUEUE, 2);
    await holder.released;

    expect(items.map((i) => i.payload)).toEqual([{ i: 0 }, { i: 1 }]);
    const attempts = attemptsById(testDb);
    for (const item of items) expect(attempts.get(item.id)).toBe(1);
  });

  it('fails with SQLITE_BUSY, claiming nothing, when the writer outlasts busy_timeout', async () => {
    seed(testDb, 2);
    testDb.db.exec('PRAGMA busy_timeout = 200;');
    const holder = await startWriteHolder(testDb.dbPath, 30_000);
    const ops = createQueueOps(testDb.db);

    let caught: unknown;
    try {
      ops.dequeue(QUEUE, 2);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ errcode: 5 });
    expect(testDb.db.isTransaction).toBe(false);

    holder.release();
    await holder.released;

    const before = attemptsById(testDb);
    expect([...before.values()]).toEqual([0, 0]);
    const statuses = testDb.db
      .prepare('SELECT DISTINCT status FROM queue_items WHERE queue_id = ?')
      .all(QUEUE) as Array<{ status: string }>;
    expect(statuses).toEqual([{ status: 'pending' }]);

    // Once the lock is free, a fresh dequeue succeeds.
    expect(ops.dequeue(QUEUE, 2)).toHaveLength(2);
  });

  it('gives two consumers in separate threads disjoint claims covering every item', async () => {
    seed(testDb, 40);
    const a = startConsumer(testDb.dbPath, QUEUE);
    const b = startConsumer(testDb.dbPath, QUEUE);
    await Promise.all([a.ready, b.ready]);
    a.go();
    b.go();
    const [idsA, idsB] = await Promise.all([a.claimed, b.claimed]);

    const all = [...idsA, ...idsB];
    expect(new Set(all).size).toBe(all.length);
    const attempts = attemptsById(testDb);
    expect(all.sort((x, y) => x - y)).toEqual(
      [...attempts.keys()].sort((x, y) => x - y),
    );
    for (const id of all) expect(attempts.get(id)).toBe(1);
  });
});
