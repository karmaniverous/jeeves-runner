import { describe, expect, it } from 'vitest';

import type {
  CollectionResponse,
  NamespacesResponse,
  StateCollectionItem,
  StateResponse,
} from './contracts.js';

describe('State contracts', () => {
  it('NamespacesResponse accepts valid shape', () => {
    const response: NamespacesResponse = { namespaces: ['email', 'github'] };
    expect(response.namespaces).toHaveLength(2);
  });

  it('StateResponse accepts valid shape', () => {
    const response: StateResponse = { lastRunAt: '2024-01-01', cursor: null };
    expect(response.lastRunAt).toBe('2024-01-01');
    expect(response.cursor).toBeNull();
  });

  it('StateCollectionItem accepts valid shape', () => {
    const item: StateCollectionItem = {
      itemKey: 'thread-123',
      value: 'seen',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(item.itemKey).toBe('thread-123');
  });

  it('CollectionResponse accepts valid shape', () => {
    const response: CollectionResponse = {
      value: 'parent-value',
      items: [
        { itemKey: 'k1', value: 'v1', updatedAt: '2024-01-01T00:00:00Z' },
      ],
      count: 1,
    };
    expect(response.items).toHaveLength(1);
    expect(response.count).toBe(1);
  });

  it('CollectionResponse accepts empty items', () => {
    const response: CollectionResponse = { value: null, items: [], count: 0 };
    expect(response.value).toBeNull();
    expect(response.items).toHaveLength(0);
  });
});
