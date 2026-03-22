/**
 * State inspection routes: list namespaces, read scalar state, and read collection items.
 *
 * @module
 */

import type { DatabaseSync } from 'node:sqlite';

import type { FastifyInstance } from 'fastify';
import { JSONPath } from 'jsonpath-plus';

/** Dependencies for state inspection routes. */
export interface StateRouteDeps {
  db: DatabaseSync;
}

/**
 * Register state inspection routes on the Fastify instance.
 */
export function registerStateRoutes(
  app: FastifyInstance,
  deps: StateRouteDeps,
): void {
  const { db } = deps;

  /** GET /state — List all distinct namespaces. */
  app.get('/state', () => {
    const rows = db
      .prepare('SELECT DISTINCT namespace FROM state')
      .all() as Array<{ namespace: string }>;
    return { namespaces: rows.map((r) => r.namespace) };
  });

  /** GET /state/:namespace — Materialise all scalar state as key-value map. */
  app.get<{ Params: { namespace: string }; Querystring: { path?: string } }>(
    '/state/:namespace',
    (request) => {
      const { namespace } = request.params;
      const rows = db
        .prepare(
          `SELECT key, value FROM state
           WHERE namespace = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        )
        .all(namespace) as Array<{ key: string; value: string | null }>;

      const state: Record<string, string | null> = {};
      for (const row of rows) {
        state[row.key] = row.value;
      }

      if (request.query.path) {
        const result: unknown = JSONPath({
          path: request.query.path,
          json: state,
        });
        return { result, count: Array.isArray(result) ? result.length : 1 };
      }

      return state;
    },
  );

  /** GET /state/:namespace/:key — Read collection items for a state key. */
  app.get<{
    Params: { namespace: string; key: string };
    Querystring: { limit?: string; order?: string; path?: string };
  }>('/state/:namespace/:key', (request) => {
    const { namespace, key } = request.params;
    const limit = parseInt(request.query.limit ?? '100', 10);
    const order = request.query.order === 'asc' ? 'ASC' : 'DESC';

    // First check scalar state value
    const scalar = db
      .prepare(
        `SELECT value FROM state
         WHERE namespace = ? AND key = ?
         AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      )
      .get(namespace, key) as { value: string | null } | undefined;

    // Get collection items
    const items = db
      .prepare(
        `SELECT item_key, value, updated_at FROM state_items
         WHERE namespace = ? AND key = ?
         ORDER BY updated_at ${order}
         LIMIT ?`,
      )
      .all(namespace, key, limit) as Array<{
      item_key: string;
      value: string | null;
      updated_at: string;
    }>;

    const mappedItems = items.map((item) => ({
      itemKey: item.item_key,
      value: item.value,
      updatedAt: item.updated_at,
    }));

    const body = {
      value: scalar?.value ?? null,
      items: mappedItems,
      count: mappedItems.length,
    };

    if (request.query.path) {
      const result: unknown = JSONPath({
        path: request.query.path,
        json: body,
      });
      return { result, count: Array.isArray(result) ? result.length : 1 };
    }

    return body;
  });
}
