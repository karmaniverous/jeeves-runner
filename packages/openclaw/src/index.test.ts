/**
 * @module index.test
 */

import { type PluginApi } from '@karmaniverous/jeeves';
import { describe, expect, it, vi } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

vi.mock('@karmaniverous/jeeves', () => {
  return {
    init: vi.fn(),
    SECTION_IDS: { Runner: 'Runner' },
    resolveWorkspacePath: vi.fn(() => '/mock/workspace'),
    resolvePluginSetting: vi.fn(
      (
        _api: unknown,
        _pluginId: string,
        key: string,
        _envVar: string,
        fallback: string,
      ) => {
        if (key === 'apiUrl') {
          const api = _api as PluginApi;
          const val =
            api.config?.plugins?.entries?.['jeeves-runner-openclaw']?.config?.[
              key
            ];
          return typeof val === 'string' ? val : fallback;
        }
        if (key === 'configRoot') {
          const api = _api as PluginApi;
          const val =
            api.config?.plugins?.entries?.['jeeves-runner-openclaw']?.config?.[
              key
            ];
          return typeof val === 'string' ? val : fallback;
        }
        return fallback;
      },
    ),
    createAsyncContentCache: vi.fn(() => vi.fn(() => 'cached content')),
    createComponentWriter: vi.fn(() => ({ start: vi.fn() })),
  };
});

describe('plugin register', () => {
  it('registers tools and starts ComponentWriter', async () => {
    const { default: register } = await import('./index.js');
    const core = (await import('@karmaniverous/jeeves')) as unknown as {
      init: MockFn;
      createComponentWriter: MockFn;
    };

    const tools = new Map<string, unknown>();
    const api: PluginApi = {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    };

    register(api);

    expect(tools.size).toBe(17);
    expect(core.init).toHaveBeenCalled();
    expect(core.createComponentWriter).toHaveBeenCalled();

    const writer = core.createComponentWriter.mock.results[0]?.value as {
      start: MockFn;
    };
    expect(writer.start).toHaveBeenCalled();
  });

  it('uses configRoot from plugin config', async () => {
    const { default: register } = await import('./index.js');
    const core = (await import('@karmaniverous/jeeves')) as unknown as {
      init: MockFn;
    };
    core.init.mockClear();

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
      registerTool() {},
    };

    register(api);

    expect(core.init).toHaveBeenCalledWith(
      expect.objectContaining({ configRoot: '/custom/config' }),
    );
  });

  it('falls back to default configRoot when not configured', async () => {
    const { default: register } = await import('./index.js');
    const core = (await import('@karmaniverous/jeeves')) as unknown as {
      init: MockFn;
    };
    core.init.mockClear();

    const api: PluginApi = { registerTool() {} };

    register(api);

    expect(core.init).toHaveBeenCalledWith(
      expect.objectContaining({ configRoot: 'j:/config' }),
    );
  });
});
