/**
 * Slack notification sender.
 *
 * @module
 */

export interface SlackNotification {
  channel: string;
  message: string;
}

export const sendSlackNotification = (
  _notification: SlackNotification,
): Promise<void> => {
  throw new Error('Not implemented');
};
