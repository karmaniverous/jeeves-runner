/**
 * @module plugin
 * OpenClaw plugin entry point. Registers all jeeves-runner tools.
 */

import type { PluginApi } from './helpers.js';
import { getApiUrl } from './helpers.js';
import { registerRunnerTools } from './runnerTools.js';

/** Register all jeeves-runner tools with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  const baseUrl = getApiUrl(api);
  registerRunnerTools(api, baseUrl);
}
