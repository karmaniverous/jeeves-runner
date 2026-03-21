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
  init,
  type PluginApi,
  resolveWorkspacePath,
  SECTION_IDS,
} from '@karmaniverous/jeeves';

import { generateRunnerContent } from './generateContent.js';
import { getApiUrl, getConfigRoot } from './helpers.js';
import { registerRunnerTools } from './runnerTools.js';
import {
  createRunnerPluginCommands,
  createRunnerServiceCommands,
} from './serviceCommands.js';

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
  registerRunnerTools(api, baseUrl);

  init({
    workspacePath: resolveWorkspacePath(api),
    configRoot: getConfigRoot(api),
  });

  const getContent = createAsyncContentCache({
    fetch: async () => generateRunnerContent(baseUrl),
    placeholder: '> Initializing runner status...',
  });

  const writer = createComponentWriter({
    name: 'runner',
    version: PLUGIN_VERSION,
    sectionId: SECTION_IDS.Runner,
    refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    generateToolsContent: getContent,
    servicePackage: '@karmaniverous/jeeves-runner',
    pluginPackage: '@karmaniverous/jeeves-runner-openclaw',
    serviceCommands: createRunnerServiceCommands(baseUrl),
    pluginCommands: createRunnerPluginCommands(),
  });

  writer.start();
}
