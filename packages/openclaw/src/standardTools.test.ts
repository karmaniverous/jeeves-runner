/**
 * Standard tools from the runner catalog (DD#91): passing `RUNNER_CATALOG` to `createPluginToolset` keeps the four standard tools' names, descriptions and parameters as they were without it.
 *
 * @module standardTools.test
 */

import {
  createPluginToolset,
  type JeevesComponentDescriptor,
  type PluginApi,
  RUNNER_PORT,
  type ToolDescriptor,
} from '@karmaniverous/jeeves';
import { describe, expect, it, vi } from 'vitest';

import register from './index.js';

const shape = (t: ToolDescriptor) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
});

/** The four standard tools as createPluginToolset builds them without a catalog. */
function catalogFreeTools(): ToolDescriptor[] {
  const descriptor = {
    name: 'runner',
    version: '0.0.0',
    servicePackage: '@karmaniverous/jeeves-runner',
    pluginPackage: '@karmaniverous/jeeves-runner-openclaw',
    defaultPort: RUNNER_PORT,
    configSchema: {
      parse: (v: unknown) => v,
      safeParse: (v: unknown) => ({ success: true as const, data: v }),
    },
    configFileName: 'config.json',
    initTemplate: () => ({}),
    startCommand: () => ['node', 'index.js'],
    run: () => Promise.resolve(),
  } as unknown as JeevesComponentDescriptor;
  return createPluginToolset(descriptor, { apiUrl: 'http://x' });
}

function registered(): Map<string, ToolDescriptor> {
  const tools = new Map<string, ToolDescriptor>();
  const api: PluginApi = {
    logger: { warn: vi.fn() },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  };
  register(api);
  return tools;
}

describe('standard tools from RUNNER_CATALOG', () => {
  it('keep their names, descriptions and parameters', () => {
    const tools = registered();
    for (const tool of catalogFreeTools()) {
      const mine = tools.get(tool.name);
      expect(mine && shape(mine)).toEqual(shape(tool));
    }
  });
});
