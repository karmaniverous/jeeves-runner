/**
 * Tests for plugin helper functions.
 */

import { describe, expect, it } from 'vitest';

import {
  connectionFail,
  fail,
  getApiUrl,
  ok,
  type PluginApi,
} from './helpers.js';

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

describe('ok', () => {
  it('wraps data as JSON text content', () => {
    const result = ok({ foo: 'bar' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ foo: 'bar' });
  });
});

describe('fail', () => {
  it('wraps error message', () => {
    const result = fail(new Error('boom'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: boom');
  });

  it('handles string errors', () => {
    const result = fail('oops');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: oops');
  });
});

describe('connectionFail', () => {
  it('returns actionable message for ECONNREFUSED', () => {
    const err = new TypeError('fetch failed');
    Object.defineProperty(err, 'cause', {
      value: { code: 'ECONNREFUSED' },
    });
    const result = connectionFail(err, 'http://localhost:1937');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not reachable');
    expect(result.content[0].text).toContain('1937');
  });

  it('falls back to generic error for other errors', () => {
    const result = connectionFail(
      new Error('bad request'),
      'http://localhost:1937',
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: bad request');
  });
});
