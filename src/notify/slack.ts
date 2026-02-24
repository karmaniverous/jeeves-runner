/**
 * Slack notification module. Sends job completion/failure messages via Slack Web API (chat.postMessage). Falls back gracefully if no token.
 */

import { request } from 'node:https';

/** Notification configuration. */
export interface NotifyConfig {
  slackToken: string | null;
}

/** Notifier interface for job completion events. */
export interface Notifier {
  notifySuccess(
    jobName: string,
    durationMs: number,
    channel: string,
  ): Promise<void>;
  notifyFailure(
    jobName: string,
    durationMs: number,
    error: string | null,
    channel: string,
  ): Promise<void>;
}

/** Post a message to Slack via chat.postMessage API. */
function postToSlack(
  token: string,
  channel: string,
  text: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ channel, text });

    const req = request(
      'https://slack.com/api/chat.postMessage',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(
              new Error(
                `Slack API returned ${String(res.statusCode)}: ${body}`,
              ),
            );
          }
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
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
