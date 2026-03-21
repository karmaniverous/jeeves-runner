/**
 * Tests for plugin helpers. Validates getApiUrl and getConfigRoot resolve
 * via plugin config, environment, and defaults.
 */

import { type PluginApi } from '@karmaniverous/jeeves';
import { describe, expect, it } from 'vitest';

import { getApiUrl, getConfigRoot } from './helpers.js';

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

describe('getConfigRoot', () => {
  it('returns default config root when no config', () => {
    const api: PluginApi = { registerTool: () => {} };
    expect(getConfigRoot(api)).toBe('j:/config');
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
    expect(getConfigRoot(api)).toBe('/custom/config');
  });
});
