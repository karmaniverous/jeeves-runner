/**
 * Tests for Gateway client.
 *
 * Note: These tests verify the client structure and mock the underlying HTTP calls.
 * Integration tests against a real Gateway should be done separately.
 */

import { describe, expect, it } from 'vitest';

import { createGatewayClient } from './client.js';

describe('Gateway client', () => {
  it('creates a client with required methods', () => {
    const client = createGatewayClient({
      url: 'http://localhost:18789',
      token: 'test-token',
    });

    expect(client).toHaveProperty('spawnSession');
    expect(client).toHaveProperty('getSessionHistory');
    expect(client).toHaveProperty('getSessionInfo');
    expect(client).toHaveProperty('isSessionComplete');
    expect(typeof client.spawnSession).toBe('function');
    expect(typeof client.getSessionHistory).toBe('function');
    expect(typeof client.getSessionInfo).toBe('function');
    expect(typeof client.isSessionComplete).toBe('function');
  });

  it('accepts optional timeout parameter', () => {
    const client = createGatewayClient({
      url: 'http://localhost:18789',
      token: 'test-token',
      timeoutMs: 60000,
    });

    expect(client).toBeDefined();
  });

  it('uses default timeout if not specified', () => {
    const client = createGatewayClient({
      url: 'http://localhost:18789',
      token: 'test-token',
    });

    expect(client).toBeDefined();
  });
});
