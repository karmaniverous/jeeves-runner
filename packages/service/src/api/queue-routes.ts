/**
 * Queue inspection routes: list queues, queue status, and peek at pending items.
 *
 * @module
 */

import type { DatabaseSync } from 'node:sqlite';

import type { FastifyInstance } from 'fastify';

/** Dependencies for queue inspection routes. */
export interface QueueRouteDeps {
  db: DatabaseSync;
}

/**
 * Register queue inspection routes on the Fastify instance.
 */
export function registerQueueRoutes(
  app: FastifyInstance,
  deps: QueueRouteDeps,
): void {
  const { db } = deps;

  /** GET /queues — List all distinct queues that have items. */
  app.get('/queues', () => {
    const rows = db
      .prepare('SELECT DISTINCT queue_id FROM queue_items')
      .all() as Array<{ queue_id: string }>;
    return { queues: rows.map((r) => r.queue_id) };
  });

  /** GET /queues/:name/status — Queue depth, claimed count, failed count, oldest age. */
  app.get<{ Params: { name: string } }>('/queues/:name/status', (request) => {
    const name = request.params.name;

    const depth = db
      .prepare(
        `SELECT COUNT(*) as count FROM queue_items
           WHERE queue_id = ? AND status = 'pending'`,
      )
      .get(name) as { count: number };

    const claimed = db
      .prepare(
        `SELECT COUNT(*) as count FROM queue_items
           WHERE queue_id = ? AND status = 'processing'`,
      )
      .get(name) as { count: number };

    const failed = db
      .prepare(
        `SELECT COUNT(*) as count FROM queue_items
           WHERE queue_id = ? AND status = 'failed'`,
      )
      .get(name) as { count: number };

    const oldest = db
      .prepare(
        `SELECT MIN(created_at) as oldest FROM queue_items
           WHERE queue_id = ? AND status = 'pending'`,
      )
      .get(name) as { oldest: string | null };

    return {
      depth: depth.count,
      claimedCount: claimed.count,
      failedCount: failed.count,
      oldestAge: oldest.oldest
        ? Date.now() - new Date(oldest.oldest).getTime()
        : null,
    };
  });

  /** GET /queues/:name/peek — Non-claiming read of pending items. */
  app.get<{ Params: { name: string }; Querystring: { limit?: string } }>(
    '/queues/:name/peek',
    (request) => {
      const name = request.params.name;
      const limit = parseInt(request.query.limit ?? '10', 10);

      const items = db
        .prepare(
          `SELECT id, payload, priority, created_at FROM queue_items
           WHERE queue_id = ? AND status = 'pending'
           ORDER BY priority DESC, created_at
           LIMIT ?`,
        )
        .all(name, limit) as Array<{
        id: number;
        payload: string;
        priority: number;
        created_at: string;
      }>;

      return {
        items: items.map((item) => ({
          id: item.id,
          payload: JSON.parse(item.payload) as unknown,
          priority: item.priority,
          createdAt: item.created_at,
        })),
      };
    },
  );
}
