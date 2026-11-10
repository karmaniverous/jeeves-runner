/**
 * @module test/wire/scenariosInspect
 * Wire scenarios for the queue and state inspection routes (spec 4B.2 entries 14-19), including malformed `limit`/`order` and bad JSONPath. Pure data.
 */

import { get, type WireScenario } from './wireTypes.js';

/** Queue and state scenarios, in run order. */
export const SCENARIOS_INSPECT: readonly WireScenario[] = [
  get('listQueues', '/queues'),
  get('listQueues empty', '/queues', {
    setup: (db) => {
      db.exec('DELETE FROM queue_items');
    },
  }),
  get('queueStatus', '/queues/work/status'),
  get('queueStatus unknown queue', '/queues/nope/status'),
  get('queuePeek', '/queues/work/peek'),
  get('queuePeek limit', '/queues/work/peek?limit=1'),
  get('queuePeek limit not a number', '/queues/work/peek?limit=abc'),
  get('queuePeek string payload', '/queues/other/peek', {
    setup: (db) => {
      db.exec(
        "UPDATE queue_items SET status = 'pending' WHERE queue_id = 'other'",
      );
    },
  }),
  get('queuePeek non-JSON payload', '/queues/broken/peek'),
  get('queuePeek unknown queue', '/queues/nope/peek'),
  get('listNamespaces', '/state'),
  get('listNamespaces empty', '/state', {
    setup: (db) => {
      db.exec('DELETE FROM state_items; DELETE FROM state;');
    },
  }),
  get('queryState', '/state/email'),
  get('queryState jsonpath', '/state/email?path=%24.lastPoll'),
  get('queryState jsonpath all', '/state/email?path=%24.*'),
  get('queryState invalid jsonpath', '/state/email?path=%24%5B((('),
  get('queryState unknown namespace', '/state/nope'),
  get('queryState keys named result and count', '/state/odd', {
    setup: (db) => {
      db.exec(
        "INSERT INTO state (namespace, key, value) VALUES ('odd', 'result', 'r'), ('odd', 'count', '2')",
      );
    },
  }),
  get('queryCollection', '/state/email/threads'),
  get('queryCollection order asc', '/state/email/threads?order=asc'),
  get('queryCollection order desc', '/state/email/threads?order=desc'),
  get('queryCollection order other', '/state/email/threads?order=sideways'),
  get('queryCollection limit', '/state/email/threads?limit=2'),
  get('queryCollection limit not a number', '/state/email/threads?limit=x'),
  get(
    'queryCollection jsonpath',
    '/state/email/threads?path=%24.items%5B*%5D.itemKey',
  ),
  get('queryCollection jsonpath scalar', '/state/email/threads?path=%24.value'),
  get(
    'queryCollection all query fields',
    '/state/email/threads?limit=1&order=asc&path=%24.count',
  ),
  get('queryCollection scalar only', '/state/email/lastPoll'),
  get('queryCollection unknown key', '/state/nope/nothing'),
];
