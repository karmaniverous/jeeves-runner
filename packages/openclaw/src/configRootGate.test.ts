/**
 * Unit tests for the lazy configRoot gate.
 *
 * @module configRootGate.test
 */

import {
  getConfigRoot,
  type PluginApi,
  resetInit,
  type ToolDescriptor,
} from '@karmaniverous/jeeves';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConfigRootGate } from './configRootGate.js';
import { CONFIG_ROOT_MISSING_MESSAGE, PLUGIN_ID } from './constants.js';

function makeTool(): ToolDescriptor & { execute: ReturnType<typeof vi.fn> } {
  return {
    name: 'probe',
    description: 'probe',
    parameters: {},
    execute: vi.fn(() =>
      Promise.resolve({ content: [{ type: 'text', text: 'ran' }] }),
    ),
  };
}

describe('createConfigRootGate', () => {
  beforeEach(() => {
    vi.stubEnv('JEEVES_CONFIG_ROOT', '');
    resetInit();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetInit();
  });

  it('blocks guarded tools until configRoot resolves, then runs them', async () => {
    const warn = vi.fn();
    const gate = createConfigRootGate({ logger: { warn }, registerTool() {} });
    const tool = makeTool();
    const guarded = gate.guard(tool);

    const blocked = await guarded.execute('a', {});
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0]?.text).toContain(CONFIG_ROOT_MISSING_MESSAGE);
    expect(tool.execute).not.toHaveBeenCalled();

    // Config arrives after registration (e.g. via env): resolved lazily.
    vi.stubEnv('JEEVES_CONFIG_ROOT', '/late/config');
    const ran = await guarded.execute('b', { x: 1 });
    expect(ran.content[0]?.text).toBe('ran');
    expect(tool.execute).toHaveBeenCalledWith('b', { x: 1 });
    expect(getConfigRoot()).toBe('/late/config');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('initializes once from plugin config', () => {
    const api: PluginApi = {
      config: {
        plugins: { entries: { [PLUGIN_ID]: { config: { configRoot: '/a' } } } },
      },
      registerTool() {},
    };
    const gate = createConfigRootGate(api);

    expect(gate.ensure()).toBe('/a');
    expect(gate.ensure()).toBe('/a');
    expect(getConfigRoot()).toBe('/a');
  });
});
