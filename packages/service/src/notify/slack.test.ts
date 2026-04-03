/**
 * Tests for Slack notification module.
 */

import { describe, expect, it, vi } from 'vitest';

import * as jeevesModule from '@karmaniverous/jeeves';
import { createNotifier } from './slack.js';

vi.mock('@karmaniverous/jeeves', async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import('@karmaniverous/jeeves');
  return {
    ...actual,
    fetchJson: vi.fn().mockResolvedValue(undefined),
  };
});

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

    expect(jeevesModule.fetchJson).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer xoxb-test',
        }),
        body: expect.stringContaining('Sync Email'),
      }),
    );
  });

  it('should post failure message with error detail', async () => {
    const notifier = createNotifier({ slackToken: 'xoxb-test' });
    await notifier.notifyFailure('Sync Email', 5000, 'exit code 1', 'C123');

    expect(jeevesModule.fetchJson).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        body: expect.stringContaining('exit code 1'),
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

      expect(jeevesModule.fetchJson).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          body: expect.stringContaining('Job1'),
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

      expect(jeevesModule.fetchJson).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          body: expect.stringContaining('boom'),
        }),
      );
    });

    it('should skip notification when no matching channel configured', async () => {
      const notifier = createNotifier({ slackToken: 'xoxb-test' });
      const logger = { error: vi.fn() };
      vi.mocked(jeevesModule.fetchJson).mockClear();

      await notifier.dispatchResult(
        { status: 'ok', durationMs: 5000, error: null },
        'Job1',
        null,
        'C-failure',
        logger,
      );

      expect(jeevesModule.fetchJson).not.toHaveBeenCalled();
    });
  });
});
