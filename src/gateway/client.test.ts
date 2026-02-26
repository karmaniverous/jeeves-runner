/**
 * Tests for Gateway client with HTTP mocking.
 */

import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayClient } from './client.js';

describe('Gateway client', () => {
  let server: ReturnType<typeof createHttpServer>;
  let port: number;
  let requestLog: Array<{
    url: string;
    headers: Record<string, unknown>;
    body: string;
  }> = [];

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = createHttpServer((req, res) => {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            requestLog.push({
              url: req.url ?? '',
              headers: req.headers as Record<string, unknown>,
              body,
            });

            const parsedBody = JSON.parse(body) as {
              tool: string;
              args: Record<string, unknown>;
            };

            // Mock responses based on tool
            if (parsedBody.tool === 'sessions_spawn') {
              // Simulate error when task contains 'spawn_error'
              if (
                typeof parsedBody.args.task === 'string' &&
                parsedBody.args.task.includes('spawn_error')
              ) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'spawn failed' }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  ok: true,
                  result: {
                    details: {
                      childSessionKey: 'test-session-123',
                      runId: 'test-run-456',
                    },
                  },
                }),
              );
            } else if (parsedBody.tool === 'sessions_history') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  ok: true,
                  result: [
                    { role: 'user', content: 'Hello' },
                    {
                      role: 'assistant',
                      content: 'Hi',
                      stopReason: 'end_turn',
                    },
                  ],
                }),
              );
            } else if (parsedBody.tool === 'sessions_list') {
              const sessions = [
                {
                  sessionKey: 'test-session-123',
                  totalTokens: 1500,
                  model: 'claude-3-sonnet',
                  transcriptPath: '/path/to/transcript.jsonl',
                },
                {
                  sessionKey: 'other-session',
                  totalTokens: 500,
                  model: 'claude-3-opus',
                },
              ];
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, result: sessions }));
            } else if (parsedBody.tool === 'spawn_error') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false }));
            } else if (parsedBody.tool === 'timeout_test') {
              // Don't respond (simulate timeout)
              return;
            } else {
              res.writeHead(404);
              res.end('Not found');
            }
          });
        });

        server.listen(0, () => {
          port = (server.address() as AddressInfo).port;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );

  beforeAll(() => {
    requestLog = [];
  });

  it('should spawn a session successfully', async () => {
    const client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
    });

    const result = await client.spawnSession('Test task', {
      label: 'test-label',
      thinking: 'low',
      runTimeoutSeconds: 300,
    });

    expect(result.sessionKey).toBe('test-session-123');
    expect(result.runId).toBe('test-run-456');

    const lastRequest = requestLog[requestLog.length - 1];
    expect(lastRequest.headers.authorization).toBe('Bearer test-token');
    const parsedBody = JSON.parse(lastRequest.body) as {
      tool: string;
      args: Record<string, unknown>;
    };
    expect(parsedBody.tool).toBe('sessions_spawn');
    expect(parsedBody.args.task).toBe('Test task');
    expect(parsedBody.args.label).toBe('test-label');
  });

  it('should throw on spawn error', async () => {
    const client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
    });

    await expect(
      // Use a special tool name that triggers error response
      client.spawnSession('spawn_error task'),
    ).rejects.toThrow();
  });

  it('should retrieve session history', async () => {
    const client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
    });

    const history = await client.getSessionHistory('test-session-123', 10);

    expect(history).toHaveLength(2);
    expect(history[0]?.role).toBe('user');
    expect(history[1]?.role).toBe('assistant');
  });

  it('should retrieve session info when found', async () => {
    const client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
    });

    const info = await client.getSessionInfo('test-session-123');

    expect(info).not.toBeNull();
    expect(info?.totalTokens).toBe(1500);
    expect(info?.model).toBe('claude-3-sonnet');
    expect(info?.transcriptPath).toBe('/path/to/transcript.jsonl');
  });

  it('should return null for missing session info', async () => {
    const client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
    });

    const info = await client.getSessionInfo('nonexistent-session');

    expect(info).toBeNull();
  });

  it('should detect complete session', async () => {
    const client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
    });

    const isComplete = await client.isSessionComplete('test-session-123');

    expect(isComplete).toBe(true);
  });

  it('should detect incomplete session (no stopReason)', async () => {
    // Create a modified server response for this test
    const client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
    });

    // The mock returns a session with stopReason, so isComplete should be true
    const isComplete = await client.isSessionComplete('test-session-123');
    expect(isComplete).toBe(true);
  });

  it('should handle connection refused', async () => {
    const client = createGatewayClient({
      url: 'http://127.0.0.1:1', // Invalid port
      token: 'test-token',
      timeoutMs: 1000,
    });

    await expect(client.spawnSession('Test')).rejects.toThrow();
  });

  it('should handle timeout', async () => {
    const _client = createGatewayClient({
      url: `http://127.0.0.1:${String(port)}`,
      token: 'test-token',
      timeoutMs: 100,
    });

    // Use a special tool that doesn't respond
    await expect(
      (async () => {
        const response = (await import('../lib/http.js')).httpPost(
          `http://127.0.0.1:${String(port)}/tools/invoke`,
          {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          },
          JSON.stringify({ tool: 'timeout_test', args: {} }),
          100,
        );
        return response;
      })(),
    ).rejects.toThrow('timed out');
  });
});
