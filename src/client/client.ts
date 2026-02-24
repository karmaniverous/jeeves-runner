/**
 * Job client library for cursor and queue operations.
 *
 * @module
 */

export interface CursorClient {
  get: (namespace: string, key: string) => Promise<string | null>;
  set: (namespace: string, key: string, value: string) => Promise<void>;
}

export interface QueueClient {
  enqueue: (queue: string, payload: unknown) => Promise<number>;
  dequeue: (queue: string) => Promise<unknown>;
}

export const createCursorClient = (): CursorClient => {
  throw new Error('Not implemented');
};

export const createQueueClient = (): QueueClient => {
  throw new Error('Not implemented');
};
