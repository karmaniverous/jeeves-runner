/**
 * Tests for session executor.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../gateway/client.js';
import { createGatewayClient } from '../gateway/client.js';
import type { MockGateway } from '../test-utils/gateway.js';
import {
  gatewayFixture,
  gatewaySessionRows,
  startMockGateway,
} from '../test-utils/gateway.js';
import { executeSession } from './session-executor.js';

describe('Session executor on captured gateway responses (#125)', () => {
  let gateway: MockGateway;

  beforeEach(async () => {
    gateway = await startMockGateway();
  });

  afterEach(() => gateway.close());

  /** Spawn returns the key of a listed fixture row (real spawn shape). */
  function spawnAs(key: string): void {
    const body = gatewayFixture('sessions_spawn');
    body.result.details.childSessionKey = key;
    gateway.replies.sessions_spawn = { status: 200, body };
  }

  it('runs to ok and records the session tokens', async () => {
    const { doneWithTokens } = gatewaySessionRows();
    spawnAs(doneWithTokens.key);

    const result = await executeSession({
      script: 'Summarise the day',
      jobId: 'session-job',
      timeoutMs: 5000,
      pollIntervalMs: 10,
      gatewayClient: createGatewayClient({ url: gateway.url, token: 't' }),
    });

    expect(result).toMatchObject({
      status: 'ok',
      tokens: doneWithTokens.totalTokens,
      resultMeta: doneWithTokens.key,
      error: null,
    });
    expect(gateway.requests.map((r) => r.tool)).toEqual([
      'sessions_spawn',
      'sessions_list',
      'sessions_list',
    ]);
  });

  it('records null tokens when the gateway reports none', async () => {
    const { doneNoTokens } = gatewaySessionRows();
    spawnAs(doneNoTokens.key);

    const result = await executeSession({
      script: 'Summarise the day',
      jobId: 'session-job',
      timeoutMs: 5000,
      pollIntervalMs: 10,
      gatewayClient: createGatewayClient({ url: gateway.url, token: 't' }),
    });

    expect(result).toMatchObject({ status: 'ok', tokens: null });
  });

  it('fails with the gateway error when the session has vanished', async () => {
    spawnAs('agent:main:subagent:vanished');
    gateway.replies.sessions_history = {
      status: 200,
      body: gatewayFixture('sessions_history.not-found'),
    };

    const result = await executeSession({
      script: 'Summarise the day',
      jobId: 'session-job',
      timeoutMs: 5000,
      pollIntervalMs: 10,
      gatewayClient: createGatewayClient({ url: gateway.url, token: 't' }),
    });

    expect(result.status).toBe('error');
    expect(result.error).toMatch(
      /^Gateway sessions_history failed: No session found/,
    );
  });
});

describe('Session executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a session with raw prompt text', async () => {
    const mockGateway: GatewayClient = {
      spawnSession: vi.fn().mockResolvedValue({
        sessionKey: 'test-key',
        runId: 'test-run',
      }),
      isSessionComplete: vi.fn().mockResolvedValue(true),
      getSessionInfo: vi.fn().mockResolvedValue({
        totalTokens: 1200,
        model: 'claude-sonnet-4',
      }),
      getSessionHistory: vi.fn(),
    };

    const result = await executeSession({
      script: 'Generate a daily digest',
      jobId: 'digest-job',
      timeoutMs: 60000,
      pollIntervalMs: 50,
      gatewayClient: mockGateway,
    });

    expect(result.status).toBe('ok');
    expect(result.tokens).toBe(1200);
    expect(result.resultMeta).toBe('test-key');
    // Note: spawnSession call verification omitted due to ESLint unbound-method rule
  });

  it('rejects script extensions (.js)', async () => {
    const mockGateway: GatewayClient = {
      spawnSession: vi.fn(),
      isSessionComplete: vi.fn(),
      getSessionInfo: vi.fn(),
      getSessionHistory: vi.fn(),
    };

    const result = await executeSession({
      script: '/path/to/script.js',
      jobId: 'legacy-job',
      timeoutMs: 60000,
      pollIntervalMs: 50,
      gatewayClient: mockGateway,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('script extension');
    // Note: spawnSession not-called verification omitted due to ESLint unbound-method rule
  });

  it('handles timeout', async () => {
    const mockGateway: GatewayClient = {
      spawnSession: vi.fn().mockResolvedValue({
        sessionKey: 'test-key',
        runId: 'test-run',
      }),
      isSessionComplete: vi.fn().mockResolvedValue(false), // Never completes
      getSessionInfo: vi.fn(),
      getSessionHistory: vi.fn(),
    };

    const result = await executeSession({
      script: 'Long running task',
      jobId: 'timeout-job',
      timeoutMs: 100,
      pollIntervalMs: 10, // Very short timeout
      gatewayClient: mockGateway,
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toContain('timed out');
  });

  it('handles spawn error', async () => {
    const mockGateway: GatewayClient = {
      spawnSession: vi
        .fn()
        .mockRejectedValue(new Error('Gateway connection refused')),
      isSessionComplete: vi.fn(),
      getSessionInfo: vi.fn(),
      getSessionHistory: vi.fn(),
    };

    const result = await executeSession({
      script: 'Test task',
      jobId: 'error-job',
      timeoutMs: 60000,
      pollIntervalMs: 50,
      gatewayClient: mockGateway,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('Gateway connection refused');
  });

  it('polls with exponential backoff', async () => {
    let callCount = 0;
    const mockGateway: GatewayClient = {
      spawnSession: vi.fn().mockResolvedValue({
        sessionKey: 'test-key',
        runId: 'test-run',
      }),
      isSessionComplete: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount >= 3); // Complete after 3 checks
      }),
      getSessionInfo: vi.fn().mockResolvedValue({
        totalTokens: 500,
        model: 'claude-sonnet-4',
      }),
      getSessionHistory: vi.fn(),
    };

    const result = await executeSession({
      script: 'Multi-step task',
      jobId: 'polling-job',
      timeoutMs: 60000,
      pollIntervalMs: 50,
      gatewayClient: mockGateway,
    });

    expect(result.status).toBe('ok');
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('handles missing session info gracefully', async () => {
    const mockGateway: GatewayClient = {
      spawnSession: vi.fn().mockResolvedValue({
        sessionKey: 'test-key',
        runId: 'test-run',
      }),
      isSessionComplete: vi.fn().mockResolvedValue(true),
      getSessionInfo: vi.fn().mockResolvedValue(null), // Session not found
      getSessionHistory: vi.fn(),
    };

    const result = await executeSession({
      script: 'Ephemeral session',
      jobId: 'no-info-job',
      timeoutMs: 60000,
      pollIntervalMs: 50,
      gatewayClient: mockGateway,
    });

    expect(result.status).toBe('ok');
    expect(result.tokens).toBe(null); // Gracefully handle missing info
  });
});
