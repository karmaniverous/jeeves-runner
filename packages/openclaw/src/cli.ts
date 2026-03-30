/**
 * CLI for installing/uninstalling the jeeves-runner OpenClaw plugin.
 *
 * Usage:
 *   npx \@karmaniverous/jeeves-runner-openclaw install
 *   npx \@karmaniverous/jeeves-runner-openclaw uninstall
 *
 * Delegates to `createPluginCli()` from core for the standard plugin
 * lifecycle: copy dist to extensions, patch OpenClaw config, manage
 * HEARTBEAT entries, and clean up managed sections on uninstall.
 *
 * @module cli
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPluginCli } from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';

const thisFile = fileURLToPath(import.meta.url);
const distDir = resolve(dirname(thisFile), '..');

// Type assertion bridges @commander-js/extra-typings Command (core dep)
// with the base commander types available here.
const program = createPluginCli({
  pluginId: PLUGIN_ID,
  distDir,
  pluginPackage: '@karmaniverous/jeeves-runner-openclaw',
  componentName: 'runner',
}) as { parse: (argv?: string[]) => void };

program.parse();
