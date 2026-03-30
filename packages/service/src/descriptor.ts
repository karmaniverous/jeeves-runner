/**
 * Runner component descriptor for the Jeeves platform.
 *
 * @remarks
 * Builds the `JeevesComponentDescriptor` consumed by core factories
 * (CLI, plugin toolset, HTTP handlers, service manager). The descriptor
 * is constructed lazily via `createRunnerDescriptor()` so that the
 * scheduler reference can be injected at runtime.
 *
 * @module descriptor
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type JeevesComponentDescriptor,
  SECTION_IDS,
} from '@karmaniverous/jeeves';

import { runnerConfigSchema } from './schemas/config.js';

/**
 * Cast the runner config schema to the core descriptor's expected type.
 *
 * The runner uses Zod 4 while core uses Zod 3. Both expose `.parse()`,
 * which is all the descriptor runtime check requires. The cast bridges
 * the TypeScript type mismatch between Zod versions.
 */
const configSchemaCompat =
  runnerConfigSchema as unknown as JeevesComponentDescriptor['configSchema'];

/** Version injected at build time by rollup plugin-replace. */
const VERSION: string = '__VERSION__';

/** Resolve the directory of this module at runtime. */
const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Callback to notify the scheduler of config changes. */
export type OnConfigApplyCallback = (
  config: Record<string, unknown>,
) => Promise<void>;

/**
 * Create the runner's component descriptor.
 *
 * @param options - Optional overrides for config-apply callback,
 *   TOOLS.md content generator, CLI commands, and plugin tools.
 * @returns A validated `JeevesComponentDescriptor`.
 */
export function createRunnerDescriptor(
  options?: Partial<
    Pick<
      JeevesComponentDescriptor,
      | 'onConfigApply'
      | 'generateToolsContent'
      | 'customCliCommands'
      | 'customPluginTools'
    >
  >,
): JeevesComponentDescriptor {
  return {
    name: 'runner',
    version: VERSION,
    servicePackage: '@karmaniverous/jeeves-runner',
    pluginPackage: '@karmaniverous/jeeves-runner-openclaw',
    defaultPort: 1937,
    configSchema: configSchemaCompat,
    configFileName: 'config.json',
    initTemplate: () =>
      runnerConfigSchema.parse({}) as unknown as Record<string, unknown>,
    onConfigApply: options?.onConfigApply,
    // MODULE_DIR resolves to the bundled CLI entry's directory at runtime
    // (dist/cli/jeeves-runner/), so index.js is a sibling, not nested deeper.
    startCommand: (configPath: string) => [
      'node',
      resolve(MODULE_DIR, 'index.js'),
      'start',
      '--config',
      configPath,
    ],
    sectionId: SECTION_IDS.Runner,
    refreshIntervalSeconds: 67,
    generateToolsContent:
      options?.generateToolsContent ?? (() => '> Runner tools content pending'),
    customCliCommands: options?.customCliCommands,
    customPluginTools: options?.customPluginTools,
  };
}
