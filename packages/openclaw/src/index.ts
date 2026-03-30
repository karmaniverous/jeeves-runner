/**
 * OpenClaw plugin for jeeves-runner.
 *
 * Thin HTTP client — all operations delegate to the jeeves-runner service.
 * Uses `@karmaniverous/jeeves` core for TOOLS.md and platform content.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAsyncContentCache,
  createComponentWriter,
  createPluginToolset,
  init,
  type JeevesComponentDescriptor,
  type PluginApi,
  resolveWorkspacePath,
  SECTION_IDS,
} from '@karmaniverous/jeeves';

import { generateRunnerContent } from './generateContent.js';
import { getApiUrl, getConfigRoot } from './helpers.js';
import { registerRunnerCustomTools } from './runnerTools.js';

/** Plugin version derived from package.json. */
const PLUGIN_VERSION: string = (() => {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(resolve(dir, '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

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
    defaultPort: 1937,
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

  // Start TOOLS.md writer
  const writer = createComponentWriter(descriptor);
  writer.start();
}
