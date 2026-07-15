import { describe, expect, it } from 'vitest';

import type {
  CollectionResponse,
  NamespacesResponse,
  QueuesResponse,
  QueueStatusResponse,
  StateCollectionItem,
  StateResponse,
} from './contracts.js';

describe('State contracts', () => {
  it('NamespacesResponse round-trips through JSON', () => {
    const raw = '{"namespaces":["email","github"]}';
    const parsed: unknown = JSON.parse(raw);
    const response = parsed as NamespacesResponse;
    expect(response.namespaces).toEqual(['email', 'github']);
  });

  it('StateResponse round-trips through JSON with null values', () => {
    const raw = '{"lastRunAt":"2024-01-01","cursor":null}';
    const parsed: unknown = JSON.parse(raw);
    const response = parsed as StateResponse;
    expect(response['lastRunAt']).toBe('2024-01-01');
    expect(response['cursor']).toBeNull();
  });

  it('StateCollectionItem round-trips through JSON', () => {
    const raw =
      '{"itemKey":"thread-123","value":"seen","updatedAt":"2024-01-01T00:00:00Z"}';
    const parsed: unknown = JSON.parse(raw);
    const item = parsed as StateCollectionItem;
    expect(item.itemKey).toBe('thread-123');
    expect(item.value).toBe('seen');
    expect(item.updatedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('CollectionResponse round-trips with populated items', () => {
    const raw = JSON.stringify({
      value: 'parent-value',
      items: [
        { itemKey: 'k1', value: 'v1', updatedAt: '2024-01-01T00:00:00Z' },
        { itemKey: 'k2', value: null, updatedAt: '2024-01-02T00:00:00Z' },
      ],
      count: 2,
    });
    const parsed: unknown = JSON.parse(raw);
    const response = parsed as CollectionResponse;
    expect(response.items).toHaveLength(2);
    expect(response.items[0]?.itemKey).toBe('k1');
    expect(response.items[1]?.value).toBeNull();
    expect(response.count).toBe(2);
  });

  it('CollectionResponse round-trips with empty state', () => {
    const raw = '{"value":null,"items":[],"count":0}';
    const parsed: unknown = JSON.parse(raw);
    const response = parsed as CollectionResponse;
    expect(response.value).toBeNull();
    expect(response.items).toEqual([]);
    expect(response.count).toBe(0);
  });
});

describe('Queue contracts', () => {
  it('QueueStatusResponse round-trips through JSON', () => {
    const raw =
      '{"depth":5,"claimedCount":2,"failedCount":1,"oldestAge":30000}';
    const parsed: unknown = JSON.parse(raw);
    const response = parsed as QueueStatusResponse;
    expect(response.depth).toBe(5);
    expect(response.claimedCount).toBe(2);
    expect(response.failedCount).toBe(1);
    expect(response.oldestAge).toBe(30000);
  });

  it('QueueStatusResponse round-trips with null oldestAge', () => {
    const raw = '{"depth":0,"claimedCount":0,"failedCount":0,"oldestAge":null}';
    const parsed: unknown = JSON.parse(raw);
    const response = parsed as QueueStatusResponse;
    expect(response.oldestAge).toBeNull();
  });

  it('QueuesResponse round-trips through JSON', () => {
    const raw = '{"queues":["email-updates","notifications"]}';
    const parsed: unknown = JSON.parse(raw);
    const response = parsed as QueuesResponse;
    expect(response.queues).toEqual(['email-updates', 'notifications']);
  });
});
