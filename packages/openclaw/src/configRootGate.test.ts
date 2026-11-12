/**
 * Unit tests for the lazy configRoot gate.
 *
 * @module configRootGate.test
 */

import { join } from 'node:path';

import {
  getConfigRoot,
  getWorkspacePath,
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

  it('runs calls the predicate marks as not reading configRoot', async () => {
    const gate = createConfigRootGate({
      logger: { warn() {} },
      registerTool() {},
    });
    const tool = makeTool();
    const guarded = gate.guard(tool, (params) => params.action === 'install');

    const ran = await guarded.execute('a', { action: 'status' });
    expect(ran.content[0]?.text).toBe('ran');

    const blocked = await guarded.execute('b', { action: 'install' });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0]?.text).toContain(CONFIG_ROOT_MISSING_MESSAGE);
    expect(tool.execute).toHaveBeenCalledTimes(1);
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

  // jeeves #138 (0.9.0): with agents.defaults.workspace unset, the workspace
  // is OpenClaw's default (<state dir>/workspace), never the plugin root.
  it("initializes core with OpenClaw's default workspace when none is configured", () => {
    const stateDir = join('/state', 'openclaw');
    vi.stubEnv('OPENCLAW_STATE_DIR', stateDir);
    const api: PluginApi = {
      config: {
        plugins: { entries: { [PLUGIN_ID]: { config: { configRoot: '/a' } } } },
      },
      resolvePath: (input: string) => join('/plugin-root', input),
      registerTool() {},
    };

    createConfigRootGate(api);

    expect(getWorkspacePath()).toBe(join(stateDir, 'workspace'));
  });

  it('initializes core with the configured agents.defaults.workspace', () => {
    const api: PluginApi = {
      config: {
        agents: { defaults: { workspace: '/configured/workspace' } },
        plugins: { entries: { [PLUGIN_ID]: { config: { configRoot: '/a' } } } },
      },
      registerTool() {},
    };

    createConfigRootGate(api);

    expect(getWorkspacePath()).toBe('/configured/workspace');
  });
});
