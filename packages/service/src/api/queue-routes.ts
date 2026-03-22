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
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS depth,
           SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS claimed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest
         FROM queue_items
         WHERE queue_id = ?`,
      )
      .get(request.params.name) as {
      depth: number | null;
      claimed: number | null;
      failed: number | null;
      oldest: string | null;
    };

    return {
      depth: row.depth ?? 0,
      claimedCount: row.claimed ?? 0,
      failedCount: row.failed ?? 0,
      oldestAge: row.oldest
        ? Date.now() - new Date(row.oldest).getTime()
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
