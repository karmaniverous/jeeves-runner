/**
 * OpenClaw plugin for jeeves-runner.
 *
 * Thin HTTP client — all operations delegate to the jeeves-runner service.
 * Uses `@karmaniverous/jeeves` core for TOOLS.md and platform content.
 *
 * @packageDocumentation
 */

import {
  createAsyncContentCache,
  createComponentWriter,
  createPluginToolset,
  getPackageVersion,
  init,
  type JeevesComponentDescriptor,
  loadWorkspaceConfig,
  type PluginApi,
  resolveWorkspacePath,
  RUNNER_PORT,
  SECTION_IDS,
  WORKSPACE_CONFIG_DEFAULTS,
} from '@karmaniverous/jeeves';

import { generateRunnerContent } from './generateContent.js';
import { getApiUrl, getConfigRoot } from './helpers.js';
import { registerRunnerCustomTools } from './runnerTools.js';

/** Plugin version derived from the nearest package.json. */
const PLUGIN_VERSION = getPackageVersion(import.meta.url);

const REFRESH_INTERVAL_SECONDS = 67;

/** Register all runner tools with the OpenClaw plugin API and start TOOLS.md writer. */
export default function register(api: PluginApi): void {
  const baseUrl = getApiUrl(api);

  init({
    workspacePath: resolveWorkspacePath(api),
    configRoot: getConfigRoot(api),
  });

  const getContent = createAsyncContentCache({
    fetch: async () => generateRunnerContent(baseUrl),
    placeholder: '> Initializing runner status...',
  });

  const descriptor: JeevesComponentDescriptor = {
    name: 'runner',
    version: PLUGIN_VERSION,
    servicePackage: '@karmaniverous/jeeves-runner',
    pluginPackage: '@karmaniverous/jeeves-runner-openclaw',
    defaultPort: RUNNER_PORT,
    // Plugin has no service-side config to validate. This pass-through schema
    // satisfies the descriptor contract; the plugin's own config is validated
    // separately via openclaw.plugin.json's configSchema.
    configSchema: {
      parse: (v: unknown) => v,
      safeParse: (v: unknown) => ({ success: true as const, data: v }),
    } as JeevesComponentDescriptor['configSchema'],
    configFileName: 'config.json',
    initTemplate: () => ({}),
    startCommand: () => ['node', 'index.js'],
    // Plugin-side descriptor; run is a no-op (service handles startup).
    async run() {},
    sectionId: SECTION_IDS.Runner,
    refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    generateToolsContent: getContent,
  };

  // Register 4 standard tools from the factory
  const standardTools = createPluginToolset(descriptor);
  for (const tool of standardTools) {
    api.registerTool(tool, { optional: true });
  }

  // Register 16 custom runner tools (excludes runner_status, now standard)
  registerRunnerCustomTools(api, baseUrl);

  // Start TOOLS.md writer with gateway URL for cleanup escalation
  const workspacePath = resolveWorkspacePath(api);
  const gatewayUrl =
    loadWorkspaceConfig(workspacePath)?.core?.gatewayUrl ??
    WORKSPACE_CONFIG_DEFAULTS.core.gatewayUrl;

  const writer = createComponentWriter(descriptor, { gatewayUrl });
  writer.start();
}
