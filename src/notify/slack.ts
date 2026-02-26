/**
 * Slack notification module. Sends job completion/failure messages via Slack Web API (chat.postMessage). Falls back gracefully if no token.
 */

import { httpPost } from '../lib/http.js';

/** Notification configuration. */
export interface NotifyConfig {
  /** Slack bot token for posting messages (null if not configured). */
  slackToken: string | null;
}

/** Notifier interface for job completion events. */
export interface Notifier {
  /** Send a success notification to a Slack channel. */
  notifySuccess(
    jobName: string,
    durationMs: number,
    channel: string,
  ): Promise<void>;
  /** Send a failure notification to a Slack channel. */
  notifyFailure(
    jobName: string,
    durationMs: number,
    error: string | null,
    channel: string,
  ): Promise<void>;
}

/** Post a message to Slack via chat.postMessage API. */
async function postToSlack(
  token: string,
  channel: string,
  text: string,
): Promise<void> {
  const payload = JSON.stringify({ channel, text });
  await httpPost(
    'https://slack.com/api/chat.postMessage',
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    payload,
  );
}

/**
 * Create a notifier that sends Slack messages for job events. If no token, logs warning and returns silently.
 */
export function createNotifier(config: NotifyConfig): Notifier {
  const { slackToken } = config;

  return {
    async notifySuccess(
      jobName: string,
      durationMs: number,
      channel: string,
    ): Promise<void> {
      if (!slackToken) {
        console.warn(
          `No Slack token configured — skipping success notification for ${jobName}`,
        );
        return;
      }
      const durationSec = (durationMs / 1000).toFixed(1);
      const text = `✅ *${jobName}* completed (${durationSec}s)`;
      await postToSlack(slackToken, channel, text);
    },

    async notifyFailure(
      jobName: string,
      durationMs: number,
      error: string | null,
      channel: string,
    ): Promise<void> {
      if (!slackToken) {
        console.warn(
          `No Slack token configured — skipping failure notification for ${jobName}`,
        );
        return;
      }
      const durationSec = (durationMs / 1000).toFixed(1);
      const errorMsg = error ? `: ${error}` : '';
      const text = `⚠️ *${jobName}* failed (${durationSec}s)${errorMsg}`;
      await postToSlack(slackToken, channel, text);
    },
  };
}
