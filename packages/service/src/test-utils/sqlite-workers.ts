/**
 * Test helpers that run SQLite work on a second connection in a worker
 * thread. `node:sqlite` is synchronous, so a competing writer in the same
 * event loop could never release its lock while the test connection waits;
 * a worker thread has its own event loop and its own connection.
 *
 * This module is both the main-thread API and the worker entry point: a
 * worker loads this same file (through `tsx`) and runs {@link runWorkerRole}.
 *
 * @module
 */

import { DatabaseSync } from 'node:sqlite';
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from 'node:worker_threads';

import { createQueueOps } from '../client/queue-ops.js';

/** Marker that tells this module it was loaded as one of its own workers. */
const ROLE_KEY = 'jeevesRunnerTestWorkerRole';

/** Data handed to a write-holder worker. */
interface HolderData {
  [ROLE_KEY]: 'holder';
  dbPath: string;
  /** Commit on our own after this long; the main thread may be blocked. */
  holdMs: number;
}

/** Data handed to a queue-consumer worker. */
interface ConsumerData {
  [ROLE_KEY]: 'consumer';
  dbPath: string;
  queue: string;
}

type RoleData = HolderData | ConsumerData;

/** A competing writer holding an open `BEGIN IMMEDIATE` transaction. */
export interface WriteHolder {
  /** Resolves once the holder has committed and closed its connection. */
  released: Promise<void>;
  /** Ask the holder to commit now (no-op if it already has). */
  release: () => void;
}

function spawn(data: RoleData): Worker {
  return new Worker(new URL(import.meta.url), {
    workerData: data,
    execArgv: ['--import', 'tsx'],
  });
}

function once<T>(worker: Worker, type: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onMessage = (msg: { type: string; value?: T; error?: string }) => {
      if (msg.type === 'error') {
        worker.off('message', onMessage);
        reject(new Error(msg.error));
      } else if (msg.type === type) {
        worker.off('message', onMessage);
        resolve(msg.value as T);
      }
    };
    worker.on('message', onMessage);
    worker.once('error', reject);
  });
}

/**
 * Start a second connection that takes the write lock (`BEGIN IMMEDIATE`),
 * writes a row (so its commit invalidates any read snapshot taken meanwhile)
 * and holds the lock for `holdMs` or until `release()`, then commits.
 * Resolves once the lock is held.
 */
export async function startWriteHolder(
  dbPath: string,
  holdMs: number,
): Promise<WriteHolder> {
  const worker = spawn({ [ROLE_KEY]: 'holder', dbPath, holdMs });
  const released = once<undefined>(worker, 'released').then(() =>
    worker.terminate().then(() => undefined),
  );
  await once<undefined>(worker, 'locked');
  return {
    released,
    release: () => {
      worker.postMessage('release');
    },
  };
}

/**
 * Drain `queue` one item at a time on a separate connection in a worker
 * thread, starting when `go` is posted. Resolves with the claimed ids.
 */
export function startConsumer(
  dbPath: string,
  queue: string,
): { ready: Promise<void>; go: () => void; claimed: Promise<number[]> } {
  const worker = spawn({ [ROLE_KEY]: 'consumer', dbPath, queue });
  const claimed = once<number[]>(worker, 'claimed').then(async (ids) => {
    await worker.terminate();
    return ids;
  });
  return {
    ready: once<undefined>(worker, 'ready'),
    go: () => {
      worker.postMessage('go');
    },
    claimed,
  };
}

function openWorkerDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

function runHolder(data: HolderData, port: NonNullable<typeof parentPort>) {
  const db = openWorkerDb(data.dbPath);
  db.exec('BEGIN IMMEDIATE');
  db.prepare(
    "INSERT INTO queue_items (queue_id, payload) VALUES ('holder', '{}')",
  ).run();
  port.postMessage({ type: 'locked' });
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    db.exec('COMMIT');
    db.close();
    port.postMessage({ type: 'released' });
  };
  const timer = setTimeout(commit, data.holdMs);
  port.on('message', commit);
}

function runConsumer(data: ConsumerData, port: NonNullable<typeof parentPort>) {
  const db = openWorkerDb(data.dbPath);
  const ops = createQueueOps(db);
  port.postMessage({ type: 'ready' });
  port.once('message', () => {
    try {
      const ids: number[] = [];
      for (;;) {
        const items = ops.dequeue(data.queue, 1);
        if (items.length === 0) break;
        ids.push(...items.map((i) => i.id));
      }
      db.close();
      port.postMessage({ type: 'claimed', value: ids });
    } catch (err) {
      port.postMessage({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/** Run this module's worker role, if it was loaded as one of its workers. */
function runWorkerRole(): void {
  if (isMainThread || !parentPort) return;
  const data = workerData as Partial<RoleData> | undefined;
  if (data?.[ROLE_KEY] === 'holder') runHolder(data as HolderData, parentPort);
  else if (data?.[ROLE_KEY] === 'consumer')
    runConsumer(data as ConsumerData, parentPort);
}

runWorkerRole();
