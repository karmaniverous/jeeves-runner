/**
 * Registration tests against the real core: registration never requires
 * `configRoot`; guarded tools report a clear error until it resolves.
 *
 * @module index.test
 */

import { readFileSync } from 'node:fs';

import {
  getConfigRoot,
  type PluginApi,
  resetInit,
  type ToolDescriptor,
} from '@karmaniverous/jeeves';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ROOT_MISSING_MESSAGE, PLUGIN_ID } from './constants.js';
import register from './index.js';

interface Harness {
  api: PluginApi;
  tools: Map<string, ToolDescriptor>;
  warn: ReturnType<typeof vi.fn>;
}

function harness(config?: Record<string, unknown>): Harness {
  const tools = new Map<string, ToolDescriptor>();
  const warn = vi.fn();
  const api: PluginApi = {
    ...(config
      ? { config: { plugins: { entries: { [PLUGIN_ID]: { config } } } } }
      : {}),
    logger: { warn },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  };
  return { api, tools, warn };
}

function text(result: Awaited<ReturnType<ToolDescriptor['execute']>>): string {
  return result.content.map((c) => c.text).join('\n');
}

describe('plugin register', () => {
  beforeEach(() => {
    vi.stubEnv('JEEVES_CONFIG_ROOT', '');
    resetInit();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetInit();
  });

  it('succeeds with no config, registers all tools, and warns once', () => {
    const { api, tools, warn } = harness();

    expect(() => {
      register(api);
    }).not.toThrow();

    // 4 standard factory tools + 16 custom runner tools = 20
    expect(tools.size).toBe(20);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('configRoot not configured yet');
    expect(() => getConfigRoot()).toThrow();
  });

  it('returns a clear tool error when configRoot is unset', async () => {
    const { api, tools, warn } = harness();
    register(api);

    const result = await tools.get('runner_config')!.execute('t1', {});

    expect(result.isError).toBe(true);
    expect(text(result)).toContain(CONFIG_ROOT_MISSING_MESSAGE);
    expect(text(result)).toContain('JEEVES_CONFIG_ROOT');
    expect(text(result)).toContain('plugin config');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('initializes core from plugin config', () => {
    const { api, warn } = harness({ configRoot: '/custom/config' });
    register(api);

    expect(warn).not.toHaveBeenCalled();
    expect(getConfigRoot()).toBe('/custom/config');
  });

  it('initializes core from JEEVES_CONFIG_ROOT', () => {
    vi.stubEnv('JEEVES_CONFIG_ROOT', '/env/config');
    const { api, warn } = harness();
    register(api);

    expect(warn).not.toHaveBeenCalled();
    expect(getConfigRoot()).toBe('/env/config');
  });

  it('falls back to console.warn when the host has no logger', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    register({ registerTool() {} });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('openclaw.plugin.json', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../openclaw.plugin.json', import.meta.url), 'utf-8'),
  ) as {
    configSchema: { properties: Record<string, Record<string, unknown>> };
  };

  it('declares configRoot and apiUrl', () => {
    expect(Object.keys(manifest.configSchema.properties).sort()).toEqual([
      'apiUrl',
      'configRoot',
    ]);
  });

  it('has no configRoot default', () => {
    expect(manifest.configSchema.properties.configRoot).not.toHaveProperty(
      'default',
    );
  });
});
