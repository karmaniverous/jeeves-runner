/**
 * Same-thread tests for queue operations: deduplication, attempt limits,
 * claim ordering, transaction rollback and retry/dead-letter handling.
 * Cross-connection locking (#126) is covered in
 * queue-ops.concurrency.test.ts, which runs writers in worker threads.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb, type TestDb } from '../test-utils/db.js';
import { createQueueOps, type QueueOps } from './queue-ops.js';

interface ItemRow {
  status: string;
  attempts: number;
  max_attempts: number;
  dedup_key: string | null;
  error: string | null;
  claimed_at: string | null;
  finished_at: string | null;
}

describe('createQueueOps', () => {
  let testDb: TestDb;
  let ops: QueueOps;

  /** Define a queue with the given dedup settings and attempt limit. */
  function defineQueue(
    id: string,
    dedupExpr: string | null,
    dedupScope: string | null,
    maxAttempts: number,
  ): void {
    testDb.db
      .prepare(
        'INSERT OR REPLACE INTO queues (id, name, dedup_expr, dedup_scope, max_attempts) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, id, dedupExpr, dedupScope, maxAttempts);
  }

  function item(id: number): ItemRow {
    return testDb.db
      .prepare(
        'SELECT status, attempts, max_attempts, dedup_key, error, claimed_at, finished_at FROM queue_items WHERE id = ?',
      )
      .get(id) as unknown as ItemRow;
  }

  beforeEach(() => {
    testDb = createTestDb();
    ops = createQueueOps(testDb.db);
  });

  afterEach(() => {
    testDb.cleanup();
  });

  describe('enqueue deduplication', () => {
    it('skips a duplicate while the first is pending or processing, then allows it once done (pending scope)', () => {
      defineQueue('q', '$.threadId', 'pending', 1);

      const first = ops.enqueue('q', { threadId: 't1' });
      expect(item(first).dedup_key).toBe('t1');
      expect(ops.enqueue('q', { threadId: 't1' })).toBe(-1);

      ops.dequeue('q');
      expect(item(first).status).toBe('processing');
      expect(ops.enqueue('q', { threadId: 't1' })).toBe(-1);

      ops.done(first);
      const again = ops.enqueue('q', { threadId: 't1' });
      expect(again).toBeGreaterThan(first);
    });

    it('keeps skipping after completion when the scope includes done', () => {
      defineQueue('q', '$.id', 'done', 1);

      const first = ops.enqueue('q', { id: 7 });
      ops.dequeue('q');
      ops.done(first);

      expect(ops.enqueue('q', { id: 7 })).toBe(-1);
      expect(ops.enqueue('q', { id: 8 })).toBeGreaterThan(first);
    });

    it('treats an empty dedup_scope as pending', () => {
      defineQueue('q', '$.id', '', 1);

      const first = ops.enqueue('q', { id: 1 });
      expect(ops.enqueue('q', { id: 1 })).toBe(-1);
      ops.dequeue('q');
      ops.done(first);
      expect(ops.enqueue('q', { id: 1 })).toBeGreaterThan(first);
    });

    it('does not deduplicate when the expression matches nothing', () => {
      defineQueue('q', '$.missing', 'pending', 1);

      const a = ops.enqueue('q', { id: 1 });
      const b = ops.enqueue('q', { id: 1 });

      expect(b).toBeGreaterThan(a);
      expect(item(a).dedup_key).toBeNull();
    });

    it('does not deduplicate when the expression cannot be evaluated', () => {
      defineQueue('q', '$.id', 'pending', 1);

      // A primitive payload makes JSONPath throw; enqueue proceeds without a key.
      const a = ops.enqueue('q', 'not-an-object');
      const b = ops.enqueue('q', 'not-an-object');

      expect(b).toBeGreaterThan(a);
      expect(item(a).dedup_key).toBeNull();
    });
  });

  describe('enqueue attempt limits', () => {
    it('takes max_attempts from the queue definition, overridden per call', () => {
      defineQueue('q', null, null, 4);

      expect(item(ops.enqueue('q', { n: 1 })).max_attempts).toBe(4);
      expect(
        item(ops.enqueue('q', { n: 2 }, { maxAttempts: 2 })).max_attempts,
      ).toBe(2);
    });

    it('defaults to one attempt for an undefined queue', () => {
      expect(item(ops.enqueue('undefined-queue', { n: 1 })).max_attempts).toBe(
        1,
      );
    });
  });

  describe('dequeue', () => {
    it('claims by priority, then age, up to the requested count', () => {
      const low = ops.enqueue('q', { n: 'low' });
      const high = ops.enqueue('q', { n: 'high' }, { priority: 5 });
      const low2 = ops.enqueue('q', { n: 'low2' });

      const claimed = ops.dequeue('q', 2);

      expect(claimed).toEqual([
        { id: high, payload: { n: 'high' } },
        { id: low, payload: { n: 'low' } },
      ]);
      expect(item(high)).toMatchObject({ status: 'processing', attempts: 1 });
      expect(item(high).claimed_at).not.toBeNull();
      expect(item(low2).status).toBe('pending');
      expect(ops.dequeue('q', 5).map((i) => i.id)).toEqual([low2]);
      expect(ops.dequeue('q')).toEqual([]);
    });

    it('rolls back every claim and rethrows when an update fails', () => {
      const a = ops.enqueue('q', { n: 1 });
      const b = ops.enqueue('q', { n: 2 });
      testDb.db.exec(`
        CREATE TEMP TRIGGER fail_second_claim BEFORE UPDATE OF status ON queue_items
        WHEN NEW.id = ${String(b)} BEGIN SELECT RAISE(ABORT, 'claim refused'); END;
      `);

      expect(() => ops.dequeue('q', 2)).toThrow('claim refused');

      expect(item(a)).toMatchObject({ status: 'pending', attempts: 0 });
      expect(item(b)).toMatchObject({ status: 'pending', attempts: 0 });
      expect(testDb.db.isTransaction).toBe(false);
    });

    it('rolls back the claim when a payload is not valid JSON', () => {
      const good = ops.enqueue('q', { n: 1 }, { priority: 1 });
      const bad = Number(
        testDb.db
          .prepare(
            "INSERT INTO queue_items (queue_id, payload, priority, max_attempts) VALUES ('q', '{not json', 0, 1)",
          )
          .run().lastInsertRowid,
      );

      expect(() => ops.dequeue('q', 2)).toThrow(SyntaxError);

      expect(item(good)).toMatchObject({ status: 'pending', attempts: 0 });
      expect(item(bad)).toMatchObject({ status: 'pending', attempts: 0 });
      expect(testDb.db.isTransaction).toBe(false);
    });
  });

  describe('fail', () => {
    it('returns an item to pending with the error while attempts remain', () => {
      const id = ops.enqueue('q', { n: 1 }, { maxAttempts: 2 });
      ops.dequeue('q');

      ops.fail(id, 'transient');

      expect(item(id)).toMatchObject({
        status: 'pending',
        attempts: 1,
        error: 'transient',
        finished_at: null,
      });
      expect(ops.dequeue('q').map((i) => i.id)).toEqual([id]);
    });

    it('dead-letters an item on its last attempt', () => {
      const id = ops.enqueue('q', { n: 1 }, { maxAttempts: 1 });
      ops.dequeue('q');

      ops.fail(id);

      expect(item(id)).toMatchObject({ status: 'failed', error: null });
      expect(item(id).finished_at).not.toBeNull();
      expect(ops.dequeue('q')).toEqual([]);
    });

    it('ignores an unknown item id', () => {
      const id = ops.enqueue('q', { n: 1 });

      expect(() => {
        ops.fail(id + 1000, 'nope');
      }).not.toThrow();
      expect(item(id)).toMatchObject({ status: 'pending', error: null });
    });
  });
});
