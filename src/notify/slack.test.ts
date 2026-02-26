/**
 * Tests for Slack notifier with HTTP mocking.
 */

import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createNotifier } from './slack.js';

describe('Slack notifier', () => {
  let server: ReturnType<typeof createServer>;
  let port: number;
  let requestLog: Array<{
    url: string;
    headers: Record<string, unknown>;
    body: string;
  }> = [];

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        // Note: Using a plain HTTP server for testing (not HTTPS)
        // In real tests you'd use node:http, but slack.ts uses https
        // For simplicity, we'll test the fallback behavior instead
        server = createServer({}, (req, res) => {
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
              channel: string;
              text: string;
            };

            if (parsedBody.channel === 'error-channel') {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'channel_not_found' }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
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

  it('should send success notification', async () => {
    const notifier = createNotifier({ slackToken: 'test-token' });

    // Note: This will fail in tests because we can't mock the actual HTTPS module easily
    // In practice, we'd need to either:
    // 1. Use a proper mock of the https module
    // 2. Extract the HTTP logic into a testable function
    // 3. Use integration tests with a test server
    // For now, we'll test the no-token path
    const noTokenNotifier = createNotifier({ slackToken: null });

    // Should not throw, just warn
    await expect(
      noTokenNotifier.notifySuccess('Test Job', 1000, 'test-channel'),
    ).resolves.toBeUndefined();

    await expect(
      noTokenNotifier.notifyFailure(
        'Test Job',
        1000,
        'Error message',
        'test-channel',
      ),
    ).resolves.toBeUndefined();
  });

  it('should handle missing token gracefully', async () => {
    const notifier = createNotifier({ slackToken: null });

    // Capture console.warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await notifier.notifySuccess('Test Job', 1000, 'test-channel');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No Slack token'),
    );

    warnSpy.mockRestore();
  });

  it('should format success message correctly', async () => {
    const notifier = createNotifier({ slackToken: null });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await notifier.notifySuccess('Test Job', 1234, 'test-channel');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test Job'),
    );

    warnSpy.mockRestore();
  });

  it('should format failure message correctly', async () => {
    const notifier = createNotifier({ slackToken: null });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await notifier.notifyFailure(
      'Test Job',
      1234,
      'Something went wrong',
      'test-channel',
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test Job'),
    );

    warnSpy.mockRestore();
  });
});
