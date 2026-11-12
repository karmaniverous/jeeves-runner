/**
 * Tool error wording (DD#91): SDK failures read as the 0.12.0-0 tools read them; the scenario baseline covers the HTTP, refused, timeout and non-JSON cases end to end, these the remaining branches.
 *
 * @module toolHelpers.test
 */

import type { PluginApi, ToolDescriptor } from '@karmaniverous/jeeves';
import { RunnerError } from '@karmaniverous/jeeves-runner-sdk';
import { describe, expect, it } from 'vitest';

import {
  JOB_ID_ALIAS,
  registerRunnerTool,
  toolError,
  toolInput,
  toolParameters,
} from './toolHelpers.js';

describe('toolError', () => {
  it('passes anything but a RunnerError through fail()', () => {
    expect(toolError(new Error('odd'), 'http://x')).toEqual({
      content: [{ type: 'text', text: 'Error: odd' }],
      isError: true,
    });
  });

  it('words a non-2xx without a captured text from its body, code and message included', () => {
    const body = {
      statusCode: 404,
      code: 'RUNNER_JOB_NOT_FOUND',
      error: 'Not Found',
      message: 'Job not found: j',
    };
    const error = new RunnerError({
      code: 'RUNNER_JOB_NOT_FOUND',
      status: 404,
      message: 'Job not found: j',
      body,
    });
    expect(toolError(error, 'http://x').content[0]?.text).toBe(
      `Error: HTTP 404: ${JSON.stringify(body)}`,
    );
  });

  it('words a non-2xx with neither text nor body as an empty object', () => {
    const error = new RunnerError({
      code: 'http_304',
      status: 304,
      message: 'x',
    });
    expect(toolError(error, 'http://x').content[0]?.text).toBe(
      'Error: HTTP 304: {}',
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

describe('toolParameters', () => {
  it('requires only the fields a caller must send (not defaulted ones)', () => {
    const params = toolParameters('createJob') as {
      required: string[];
      properties: { source_type: { default?: unknown } };
    };
    expect(params.required).toEqual(['id', 'name', 'schedule', 'script']);
    expect(params.properties.source_type.default).toBe('path');
  });

  it('exposes aliased fields under the tool parameter name', () => {
    const params = toolParameters('jobRuns', JOB_ID_ALIAS) as {
      required: string[];
      properties: { jobId: unknown; limit: { type?: string } };
      additionalProperties: boolean;
    };
    expect(Object.keys(params.properties)).toEqual(['jobId', 'limit']);
    expect(params.required).toEqual(['jobId']);
    expect(params.properties.limit.type).toBe('integer');
    expect(params.additionalProperties).toBe(false);
  });

  it('omits required when nothing is', () => {
    expect(toolParameters('listJobs')).not.toHaveProperty('required');
  });
});

describe('toolInput', () => {
  it('reads aliased parameters and drops undefined and unknown ones', () => {
    expect(
      toolInput('jobRuns', JOB_ID_ALIAS, {
        jobId: 'a',
        limit: undefined,
        colour: 'red',
      }),
    ).toEqual({ id: 'a' });
  });

  it('passes body fields through by name', () => {
    expect(
      toolInput('updateScript', JOB_ID_ALIAS, {
        jobId: 'a',
        script: 'x',
        source_type: 'inline',
      }),
    ).toEqual({ id: 'a', script: 'x', source_type: 'inline' });
  });
});
