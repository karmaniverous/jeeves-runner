/**
 * Tests for plugin helpers. Validates getApiUrl and resolveConfigRoot resolve
 * via plugin config, environment, and defaults.
 */

import { type PluginApi } from '@karmaniverous/jeeves';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getApiUrl, resolveConfigRoot } from './helpers.js';

describe('getApiUrl', () => {
  it('returns default URL when no config', () => {
    const api: PluginApi = { registerTool: () => {} };
    expect(getApiUrl(api)).toBe('http://127.0.0.1:1937');
  });

  it('returns configured URL', () => {
    const api: PluginApi = {
      config: {
        plugins: {
          entries: {
            'jeeves-runner-openclaw': {
              config: { apiUrl: 'http://localhost:3100' },
            },
          },
        },
      },
      registerTool: () => {},
    };
    expect(getApiUrl(api)).toBe('http://localhost:3100');
  });
});

describe('resolveConfigRoot', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns undefined when configRoot is not configured', () => {
    vi.stubEnv('JEEVES_CONFIG_ROOT', '');
    const api: PluginApi = { registerTool: () => {} };
    expect(resolveConfigRoot(api)).toBeUndefined();
  });

  it('falls back to JEEVES_CONFIG_ROOT', () => {
    vi.stubEnv('JEEVES_CONFIG_ROOT', '/env/config');
    const api: PluginApi = { registerTool: () => {} };
    expect(resolveConfigRoot(api)).toBe('/env/config');
  });

  it('returns configured config root', () => {
    const api: PluginApi = {
      config: {
        plugins: {
          entries: {
            'jeeves-runner-openclaw': {
              config: { configRoot: '/custom/config' },
            },
          },
        },
      },
      registerTool: () => {},
    };
    expect(resolveConfigRoot(api)).toBe('/custom/config');
  });
});
