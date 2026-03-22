/**
 * Tests for queue and state inspection routes.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createRouteTestHarness } from '../test-utils/routes.js';

describe('Queue & State routes', () => {
  let testDb: TestDb;
  let app: FastifyInstance;

  beforeEach(async () => {
    const harness = await createRouteTestHarness();
    testDb = harness.testDb;
    app = harness.app;
  });

  afterEach(async () => {
    await app.close();
    testDb.cleanup();
  });

  // --- Queue routes ---

  it('GET /queues should return empty list', async () => {
    const response = await app.inject({ method: 'GET', url: '/queues' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { queues: string[] };
    expect(body.queues).toEqual([]);
  });

  it('GET /queues should return queue IDs with items', async () => {
    testDb.db
      .prepare(
        `INSERT INTO queue_items (queue_id, payload, status) VALUES (?, ?, ?)`,
      )
      .run('test-queue', '{"msg":"hello"}', 'pending');

    const response = await app.inject({ method: 'GET', url: '/queues' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { queues: string[] };
    expect(body.queues).toContain('test-queue');
  });

  it('GET /queues/:name/status should return counts for unknown queue', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/queues/nonexistent/status',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      depth: number;
      claimedCount: number;
      failedCount: number;
      oldestAge: number | null;
    };
    expect(body.depth).toBe(0);
    expect(body.claimedCount).toBe(0);
    expect(body.failedCount).toBe(0);
    expect(body.oldestAge).toBeNull();
  });

  it('GET /queues/:name/status should return correct counts', async () => {
    testDb.db
      .prepare(
        `INSERT INTO queue_items (queue_id, payload, status) VALUES (?, ?, ?)`,
      )
      .run('q1', '{}', 'pending');
    testDb.db
      .prepare(
        `INSERT INTO queue_items (queue_id, payload, status, claimed_at) VALUES (?, ?, ?, datetime('now'))`,
      )
      .run('q1', '{}', 'processing');
    testDb.db
      .prepare(
        `INSERT INTO queue_items (queue_id, payload, status) VALUES (?, ?, ?)`,
      )
      .run('q1', '{}', 'failed');

    const response = await app.inject({
      method: 'GET',
      url: '/queues/q1/status',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      depth: number;
      claimedCount: number;
      failedCount: number;
    };
    expect(body.depth).toBe(1);
    expect(body.claimedCount).toBe(1);
    expect(body.failedCount).toBe(1);
  });

  it('GET /queues/:name/peek should return pending items', async () => {
    testDb.db
      .prepare(
        `INSERT INTO queue_items (queue_id, payload, status, priority) VALUES (?, ?, ?, ?)`,
      )
      .run('peek-q', '{"item":1}', 'pending', 0);
    testDb.db
      .prepare(
        `INSERT INTO queue_items (queue_id, payload, status, priority) VALUES (?, ?, ?, ?)`,
      )
      .run('peek-q', '{"item":2}', 'pending', 10);
    // Processing items should not appear
    testDb.db
      .prepare(
        `INSERT INTO queue_items (queue_id, payload, status) VALUES (?, ?, ?)`,
      )
      .run('peek-q', '{"item":3}', 'processing');

    const response = await app.inject({
      method: 'GET',
      url: '/queues/peek-q/peek',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      items: Array<{ id: number; payload: unknown; priority: number }>;
    };
    expect(body.items).toHaveLength(2);
    // Higher priority first
    expect(body.items[0]?.priority).toBe(10);
  });

  // --- State routes ---

  it('GET /state should return empty namespaces', async () => {
    const response = await app.inject({ method: 'GET', url: '/state' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { namespaces: string[] };
    expect(body.namespaces).toEqual([]);
  });

  it('GET /state should return namespaces', async () => {
    testDb.db
      .prepare(`INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)`)
      .run('ns1', 'k1', 'v1');
    testDb.db
      .prepare(`INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)`)
      .run('ns2', 'k2', 'v2');

    const response = await app.inject({ method: 'GET', url: '/state' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { namespaces: string[] };
    expect(body.namespaces).toContain('ns1');
    expect(body.namespaces).toContain('ns2');
  });

  it('GET /state/:namespace should return key-value map', async () => {
    testDb.db
      .prepare(`INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)`)
      .run('myns', 'cursor', '12345');
    testDb.db
      .prepare(`INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)`)
      .run('myns', 'token', 'abc');

    const response = await app.inject({ method: 'GET', url: '/state/myns' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, string>;
    expect(body.cursor).toBe('12345');
    expect(body.token).toBe('abc');
  });

  it('GET /state/:namespace?path=$.cursor should query via JSONPath', async () => {
    testDb.db
      .prepare(`INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)`)
      .run('jpns', 'cursor', '999');

    const response = await app.inject({
      method: 'GET',
      url: '/state/jpns?path=$.cursor',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      result: unknown[];
      count: number;
    };
    expect(body.count).toBe(1);
    expect(body.result).toEqual(['999']);
  });

  it('GET /state/:namespace/:key should return scalar and collection items', async () => {
    testDb.db
      .prepare(`INSERT INTO state (namespace, key, value) VALUES (?, ?, ?)`)
      .run('coll-ns', 'repos', 'parent-value');
    testDb.db
      .prepare(
        `INSERT INTO state_items (namespace, key, item_key, value) VALUES (?, ?, ?, ?)`,
      )
      .run('coll-ns', 'repos', 'repo-a', 'data-a');
    testDb.db
      .prepare(
        `INSERT INTO state_items (namespace, key, item_key, value) VALUES (?, ?, ?, ?)`,
      )
      .run('coll-ns', 'repos', 'repo-b', 'data-b');

    const response = await app.inject({
      method: 'GET',
      url: '/state/coll-ns/repos',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      value: string | null;
      items: Array<{
        itemKey: string;
        value: string | null;
        updatedAt: string;
      }>;
      count: number;
    };
    expect(body.value).toBe('parent-value');
    expect(body.count).toBe(2);
    expect(body.items.map((i) => i.itemKey).sort()).toEqual([
      'repo-a',
      'repo-b',
    ]);
  });

  it('GET /state/:namespace/:key should return empty for missing key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/state/missing-ns/missing-key',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      value: string | null;
      items: unknown[];
      count: number;
    };
    expect(body.value).toBeNull();
    expect(body.count).toBe(0);
  });
});
