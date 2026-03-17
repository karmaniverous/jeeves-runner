/**
 * @module plugin/index.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { PluginApi } from './helpers.js';

type MockFn = ReturnType<typeof vi.fn>;

vi.mock('@karmaniverous/jeeves', () => {
  return {
    init: vi.fn(),
    SECTION_IDS: { Runner: 'Runner' },
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

    expect(tools.size).toBe(7);
    expect(core.init).toHaveBeenCalled();
    expect(core.createComponentWriter).toHaveBeenCalled();

    const writer = core.createComponentWriter.mock.results[0]?.value as {
      start: MockFn;
    };
    expect(writer.start).toHaveBeenCalled();
  });
});
