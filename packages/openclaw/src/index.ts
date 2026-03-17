/**
 * @module plugin
 * OpenClaw plugin entry point. Registers runner tools and keeps TOOLS.md in sync.
 */

import {
  createComponentWriter,
  init,
  type JeevesComponent,
  SECTION_IDS,
} from '@karmaniverous/jeeves';

import type { PluginApi } from './helpers.js';
import { getApiUrl, getPluginConfig, resolveWorkspacePath } from './helpers.js';
import { createRunnerContentCache } from './runnerContentCache.js';
import { registerRunnerTools } from './runnerTools.js';
import {
  createRunnerPluginCommands,
  createRunnerServiceCommands,
} from './serviceCommands.js';

const DEFAULT_CONFIG_ROOT = 'j:/config';
const REFRESH_INTERVAL_SECONDS = 67;
const COMPONENT_NAME = 'runner';
const COMPONENT_VERSION = '0.3.1';

/** Register all runner tools with the OpenClaw plugin API and start TOOLS.md writer. */
export default function register(api: PluginApi): void {
  const baseUrl = getApiUrl(api);
  registerRunnerTools(api, baseUrl);

  // Initialize core paths
  const workspacePath = resolveWorkspacePath(api);
  const getConfig = (api as unknown as { getConfig?: (key: string) => unknown })
    .getConfig;
  const configRootRaw =
    (typeof getConfig === 'function' ? getConfig('configRoot') : undefined) ??
    getPluginConfig(api, 'configRoot');
  const configRoot =
    typeof configRootRaw === 'string' && configRootRaw.trim().length > 0
      ? configRootRaw
      : DEFAULT_CONFIG_ROOT;

  init({ workspacePath, configRoot });

  // Synchronous generator backed by async cache
  const cache = createRunnerContentCache(baseUrl);
  void cache.refresh(); // prime

  const component: JeevesComponent = {
    name: COMPONENT_NAME,
    version: COMPONENT_VERSION,
    sectionId: SECTION_IDS.Runner,
    refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    generateToolsContent: () => cache.getContent(),
    serviceCommands: createRunnerServiceCommands(baseUrl),
    pluginCommands: createRunnerPluginCommands(),
  };

  const writer = createComponentWriter(component);
  writer.start();
}
