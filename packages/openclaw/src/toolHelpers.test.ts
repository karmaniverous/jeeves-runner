/**
 * Tool error wording (DD#91): SDK failures read as the 0.12.0-0 tools read them; the scenario baseline covers the HTTP, refused, timeout and non-JSON cases end to end, these the remaining branches.
 *
 * @module toolHelpers.test
 */

import type { PluginApi, ToolDescriptor } from '@karmaniverous/jeeves';
import { RunnerError } from '@karmaniverous/jeeves-runner-sdk';
import { describe, expect, it } from 'vitest';

import { pick, registerRunnerTool, toolError } from './toolHelpers.js';

describe('toolError', () => {
  it('passes anything but a RunnerError through fail()', () => {
    expect(toolError(new Error('odd'), 'http://x')).toEqual({
      content: [{ type: 'text', text: 'Error: odd' }],
      isError: true,
    });
  });

  it('words a non-2xx without a captured text from its body', () => {
    const error = new RunnerError({
      code: 'http_404',
      status: 404,
      message: 'x',
      body: { error: 'Job not found' },
    });
    expect(toolError(error, 'http://x').content[0]?.text).toBe(
      'Error: HTTP 404: {"error":"Job not found"}',
    );
  });

  it('reports a RunnerError without a cause by its message', () => {
    const error = new RunnerError({
      code: 'invalid_options',
      status: 0,
      message: 'baseUrl must be an http(s) URL, got "nope"',
    });
    expect(toolError(error, 'nope').content[0]?.text).toBe(
      'Error: baseUrl must be an http(s) URL, got "nope"',
    );
  });
});

describe('registerRunnerTool', () => {
  it('reports a misconfigured apiUrl as a tool error', async () => {
    let tool: ToolDescriptor | undefined;
    const api: PluginApi = {
      registerTool(t) {
        tool = t;
      },
    };
    registerRunnerTool(api, () => 'not a url', {
      name: 'runner_jobs',
      entry: 'listJobs',
      parameters: {},
      toInput: () => ({}),
    });
    const result = await tool!.execute('t', {});
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: baseUrl must be an http(s) URL, got "not a url"',
        },
      ],
      isError: true,
    });
  });
});

describe('pick', () => {
  it('copies only the defined parameters among the keys', () => {
    expect(pick({ a: 1, b: undefined, c: 3 }, ['a', 'b'])).toEqual({ a: 1 });
  });
});
