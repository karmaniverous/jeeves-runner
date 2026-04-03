/**
 * Tests for Slack notification module.
 */

import { fetchJson } from '@karmaniverous/jeeves';
import { describe, expect, it, type Mock, vi } from 'vitest';

import { createNotifier } from './slack.js';

vi.mock('@karmaniverous/jeeves', () => ({
  fetchJson: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchJson = fetchJson as Mock;

describe('createNotifier', () => {
  it('should warn and skip when no token configured', async () => {
    const notifier = createNotifier({ slackToken: null });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await notifier.notifySuccess('Test Job', 5000, 'C123');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipping success notification'),
    );

    await notifier.notifyFailure('Test Job', 5000, 'boom', 'C123');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipping failure notification'),
    );

    warnSpy.mockRestore();
  });

  it('should post success message to Slack', async () => {
    const notifier = createNotifier({ slackToken: 'xoxb-test' });
    await notifier.notifySuccess('Sync Email', 12345, 'C123');

    expect(mockFetchJson).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer xoxb-test',
        }) as Record<string, string>,
        body: expect.stringContaining('Sync Email') as string,
      }),
    );
  });

  it('should post failure message with error detail', async () => {
    const notifier = createNotifier({ slackToken: 'xoxb-test' });
    await notifier.notifyFailure('Sync Email', 5000, 'exit code 1', 'C123');

    expect(mockFetchJson).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        body: expect.stringContaining('exit code 1') as string,
      }),
    );
  });

  describe('dispatchResult', () => {
    it('should dispatch success notification when status=ok and onSuccess set', async () => {
      const notifier = createNotifier({ slackToken: 'xoxb-test' });
      const logger = { error: vi.fn() };

      await notifier.dispatchResult(
        { status: 'ok', durationMs: 5000, error: null },
        'Job1',
        'C-success',
        'C-failure',
        logger,
      );

      expect(mockFetchJson).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          body: expect.stringContaining('Job1') as string,
        }),
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should dispatch failure notification when status!=ok and onFailure set', async () => {
      const notifier = createNotifier({ slackToken: 'xoxb-test' });
      const logger = { error: vi.fn() };

      await notifier.dispatchResult(
        { status: 'error', durationMs: 5000, error: 'boom' },
        'Job1',
        'C-success',
        'C-failure',
        logger,
      );

      expect(mockFetchJson).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          body: expect.stringContaining('boom') as string,
        }),
      );
    });

    it('should skip notification when no matching channel configured', async () => {
      const notifier = createNotifier({ slackToken: 'xoxb-test' });
      const logger = { error: vi.fn() };
      mockFetchJson.mockClear();

      await notifier.dispatchResult(
        { status: 'ok', durationMs: 5000, error: null },
        'Job1',
        null,
        'C-failure',
        logger,
      );

      expect(mockFetchJson).not.toHaveBeenCalled();
    });
  });
});
