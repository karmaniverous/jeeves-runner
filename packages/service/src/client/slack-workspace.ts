/**
 * Slack channel → workspace mapping cache.
 * Resolves which Slack workspace owns a given channel.
 *
 * @module
 */

import fs from 'node:fs';
import https from 'node:https';

/** Options for the Slack workspace resolver. */
export interface SlackWorkspaceOptions {
  /** Path to the channel→workspace cache JSON file. */
  cachePath: string;
  /** Default workspace team ID when resolution fails. */
  defaultWorkspace: string;
}

let _cache: Record<string, string> | null = null;
let _dirty = false;
let _cachePath = '';

function loadCache(cachePath: string): Record<string, string> {
  if (!_cache || _cachePath !== cachePath) {
    _cachePath = cachePath;
    try {
      _cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<
        string,
        string
      >;
    } catch {
      _cache = {};
    }
  }
  return _cache;
}

/** Flush pending cache changes to disk. */
export function saveCache(): void {
  if (_dirty && _cache && _cachePath) {
    fs.writeFileSync(_cachePath, JSON.stringify(_cache, null, 2) + '\n');
    _dirty = false;
  }
}

function queryChannelWorkspace(
  channelId: string,
  token: string,
  defaultWorkspace: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://slack.com/api/conversations.info?channel=${channelId}`;
    https
      .get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let d = '';
        res.on('data', (c: Buffer) => (d += c.toString()));
        res.on('end', () => {
          try {
            const j = JSON.parse(d) as {
              ok: boolean;
              channel?: { shared_team_ids?: string[] };
            };
            if (!j.ok) {
              resolve(defaultWorkspace);
              return;
            }
            const shared = j.channel?.shared_team_ids ?? [];
            if (shared.length > 0 && !shared.includes(defaultWorkspace)) {
              resolve(shared[0]);
            } else {
              resolve(defaultWorkspace);
            }
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Resolve the workspace team ID that owns a Slack channel.
 * Results are cached to disk.
 *
 * @param channelId - Slack channel ID.
 * @param token - Slack bot token for API calls.
 * @param options - Cache path and default workspace.
 */
export async function getChannelWorkspace(
  channelId: string,
  token: string,
  options: SlackWorkspaceOptions,
): Promise<string> {
  const cache = loadCache(options.cachePath);
  if (cache[channelId]) return cache[channelId];

  const teamId = await queryChannelWorkspace(
    channelId,
    token,
    options.defaultWorkspace,
  );
  cache[channelId] = teamId;
  _dirty = true;
  return teamId;
}
