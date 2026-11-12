/**
 * Catalog handlers for queue and state inspection (spec 4B.2 entries 14-19). SQL unchanged from 0.14.0-0; `limit`, `order` and `path` arrive validated by the catalog; a non-JSON payload and a bad JSONPath throw the runner's 400s (DD#96). Reads SQLite only.
 *
 * @module api/inspect-handlers
 */

import type { DatabaseSync } from 'node:sqlite';

import { InvalidQueuePayload } from './errors.js';
import { fromSync, withJsonPath } from './handler-utils.js';

/** Dependencies of the inspection handlers. */
export interface InspectHandlerDeps {
  /** Runner database. */
  db: DatabaseSync;
}

/** Default `limit` of `GET /queues/:name/peek`. */
const DEFAULT_PEEK_LIMIT = 10;

/** Default `limit` of `GET /state/:namespace/:key`. */
const DEFAULT_COLLECTION_LIMIT = 100;

/** Live (unexpired) scalar state rows. */
const LIVE_STATE = "(expires_at IS NULL OR expires_at > datetime('now'))";

/**
 * Milliseconds since a SQLite timestamp, or null; an unparseable timestamp
 * gives null, which is what `JSON.stringify(NaN)` sent before.
 *
 * @param oldest - SQLite timestamp of the oldest pending item.
 * @returns Age in milliseconds, or null.
 */
export function ageOf(oldest: string | null): number | null {
  if (!oldest) return null;
  const age = Date.now() - new Date(oldest).getTime();
  return Number.isFinite(age) ? age : null;
}

/**
 * A stored queue payload, parsed.
 *
 * @param payload - The `payload` column (JSON text).
 * @returns The parsed value.
 * @throws `RUNNER_INVALID_QUEUE_PAYLOAD` when it is not JSON.
 */
export function parsePayload(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new InvalidQueuePayload();
  }
}

/**
 * Handlers for the queue and state entries.
 *
 * @param deps - Database.
 * @returns Handlers keyed by entry name.
 */
export function createInspectHandlers(deps: InspectHandlerDeps) {
  const { db } = deps;

  return fromSync({
    listQueues: () => {
      const rows = db
        .prepare('SELECT DISTINCT queue_id FROM queue_items')
        .all() as Array<{ queue_id: string | null }>;
      return { status: 200, body: { queues: rows.map((r) => r.queue_id) } };
    },

    queueStatus: ({ params }) => {
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
        .get(params.name) as {
        depth: number | null;
        claimed: number | null;
        failed: number | null;
        oldest: string | null;
      };
      return {
        status: 200,
        body: {
          depth: row.depth ?? 0,
          claimedCount: row.claimed ?? 0,
          failedCount: row.failed ?? 0,
          oldestAge: ageOf(row.oldest),
        },
      };
    },

    queuePeek: ({ params, query }) => {
      const items = db
        .prepare(
          `SELECT id, payload, priority, created_at FROM queue_items
           WHERE queue_id = ? AND status = 'pending'
           ORDER BY priority DESC, created_at
           LIMIT ?`,
        )
        .all(params.name, query.limit ?? DEFAULT_PEEK_LIMIT) as Array<{
        id: number;
        payload: string;
        priority: number | null;
        created_at: string | null;
      }>;
      return {
        status: 200,
        body: {
          items: items.map((item) => ({
            id: item.id,
            payload: parsePayload(item.payload),
            priority: item.priority,
            createdAt: item.created_at,
          })),
        },
      };
    },

    listNamespaces: () => {
      const rows = db
        .prepare('SELECT DISTINCT namespace FROM state')
        .all() as Array<{ namespace: string }>;
      return {
        status: 200,
        body: { namespaces: rows.map((r) => r.namespace) },
      };
    },

    queryState: ({ params, query }) => {
      const rows = db
        .prepare(
          `SELECT key, value FROM state WHERE namespace = ? AND ${LIVE_STATE}`,
        )
        .all(params.namespace) as Array<{ key: string; value: string | null }>;
      const state: Record<string, string | null> = {};
      for (const row of rows) state[row.key] = row.value;
      return { status: 200, body: withJsonPath(state, query.path) };
    },

    queryCollection: ({ params, query }) => {
      const { namespace, key } = params;
      const order = query.order === 'asc' ? 'ASC' : 'DESC';
      const scalar = db
        .prepare(
          `SELECT value FROM state WHERE namespace = ? AND key = ? AND ${LIVE_STATE}`,
        )
        .get(namespace, key) as { value: string | null } | undefined;
      const items = db
        .prepare(
          `SELECT item_key, value, updated_at FROM state_items
           WHERE namespace = ? AND key = ?
           ORDER BY updated_at ${order}
           LIMIT ?`,
        )
        .all(namespace, key, query.limit ?? DEFAULT_COLLECTION_LIMIT) as Array<{
        item_key: string;
        value: string | null;
        updated_at: string | null;
      }>;
      const mapped = items.map((item) => ({
        itemKey: item.item_key,
        value: item.value,
        updatedAt: item.updated_at,
      }));
      const body = {
        value: scalar?.value ?? null,
        items: mapped,
        count: mapped.length,
      };
      return { status: 200, body: withJsonPath(body, query.path) };
    },
  });
}
