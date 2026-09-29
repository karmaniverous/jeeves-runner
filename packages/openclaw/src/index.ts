/**
 * OpenClaw plugin for jeeves-runner.
 *
 * Thin HTTP client — all operations delegate to the jeeves-runner service.
 * A standard OpenClaw plugin: it registers tools and ships its skill via the
 * manifest; it writes no workspace files. Installed by `jeeves install`.
 *
 * @packageDocumentation
 */

import {
  createPluginToolset,
  getPackageVersion,
  type JeevesComponentDescriptor,
  type PluginApi,
  RUNNER_PORT,
} from '@karmaniverous/jeeves';

import { createConfigRootGate } from './configRootGate.js';
import { getApiUrl } from './helpers.js';
import { registerRunnerCustomTools } from './runnerTools.js';
import { CONFIG_ROOT_READERS } from './toolGating.js';

/** Plugin version derived from the nearest package.json. */
const PLUGIN_VERSION = getPackageVersion(import.meta.url);

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
};

/**
 * Register all runner tools with the OpenClaw plugin API.
 *
 * @remarks
 * Always succeeds, even with no plugin config: `configRoot` is resolved
 * lazily (see {@link createConfigRootGate}). Only tools that read
 * `configRoot` are gated (see {@link CONFIG_ROOT_READERS}); HTTP-only tools
 * work without it.
 */
export default function register(api: PluginApi): void {
  const baseUrl = getApiUrl(api);
  const gate = createConfigRootGate(api);

  // 4 standard tools from the core factory; gate only configRoot readers.
  // apiUrl is resolved lazily per call (same resolution as the custom tools).
  const standardTools = createPluginToolset(descriptor, {
    apiUrl: () => getApiUrl(api),
  });
  for (const tool of standardTools) {
    const readsConfigRoot = CONFIG_ROOT_READERS[tool.name];
    api.registerTool(
      readsConfigRoot ? gate.guard(tool, readsConfigRoot) : tool,
      {
        optional: true,
      },
    );
  }

  // 16 custom runner tools (HTTP only; excludes runner_status, now standard)
  registerRunnerCustomTools(api, baseUrl);
}
