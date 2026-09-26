/**
 * Runner-specific convenience wrappers over `@karmaniverous/jeeves` core SDK.
 *
 * @module helpers
 */

import {
  type PluginApi,
  resolveOptionalPluginSetting,
  resolvePluginSetting,
  RUNNER_PORT,
} from '@karmaniverous/jeeves';

import { CONFIG_ROOT_ENV_VAR, PLUGIN_ID } from './constants.js';

/** Resolve the runner API base URL. */
export function getApiUrl(api: PluginApi): string {
  return resolvePluginSetting(
    api,
    PLUGIN_ID,
    'apiUrl',
    'JEEVES_RUNNER_URL',
    `http://127.0.0.1:${String(RUNNER_PORT)}`,
  );
}

/**
 * Resolve the platform config root (plugin config, then
 * `JEEVES_CONFIG_ROOT`).
 *
 * @returns The config root, or `undefined` when it is not configured yet.
 */
export function resolveConfigRoot(api: PluginApi): string | undefined {
  return resolveOptionalPluginSetting(
    api,
    PLUGIN_ID,
    'configRoot',
    CONFIG_ROOT_ENV_VAR,
  );
}
