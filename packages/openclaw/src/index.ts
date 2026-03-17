/**
 * @module plugin
 * OpenClaw plugin entry point. Registers runner tools and keeps TOOLS.md in sync.
 */

import {
  createAsyncContentCache,
  createComponentWriter,
  init,
  type JeevesComponent,
  SECTION_IDS,
} from '@karmaniverous/jeeves';

import { generateRunnerContent } from './generateContent.js';
import type { PluginApi } from './helpers.js';
import { getApiUrl, getPluginConfig, resolveWorkspacePath } from './helpers.js';
import { registerRunnerTools } from './runnerTools.js';
import {
  createRunnerPluginCommands,
  createRunnerServiceCommands,
} from './serviceCommands.js';

const DEFAULT_CONFIG_ROOT = 'j:/config';
const REFRESH_INTERVAL_SECONDS = 67;
const COMPONENT_NAME = 'runner';
const COMPONENT_VERSION = '0.1.0';

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

  // Synchronous generator backed by async cache from core
  const getContent = createAsyncContentCache({
    fetch: async () => generateRunnerContent(baseUrl),
    placeholder: '> Initializing runner status...',
  });

  const component: JeevesComponent = {
    name: COMPONENT_NAME,
    version: COMPONENT_VERSION,
    sectionId: SECTION_IDS.Runner,
    refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    generateToolsContent: getContent,
    serviceCommands: createRunnerServiceCommands(baseUrl),
    pluginCommands: createRunnerPluginCommands(),
  };

  const writer = createComponentWriter(component);
  writer.start();
}
