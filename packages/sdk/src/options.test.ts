/**
 * @module options.test
 * Client options: base URL and timeout validation, the defaults (120 s, jeeves' own default; 30 min for `triggerJob`), and the fetch adapter that keeps non-2xx bodies as received.
 */

import { DEFAULT_FETCH_TIMEOUT_MS } from '@karmaniverous/jeeves';
import { describe, expect, it, vi } from 'vitest';

import {
  captureErrorText,
  checkTimeout,
  DEFAULT_TIMEOUT_MS,
  resolveClientOptions,
  TRIGGER_TIMEOUT_MS,
} from './options.js';

const stubFetch = () => vi.fn(() => Promise.resolve(new Response('{}')));

describe('defaults', () => {
  it("is jeeves' default fetch timeout (120 s)", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
  });

  it('gives triggerJob 30 minutes (DD#79)', () => {
    expect(TRIGGER_TIMEOUT_MS).toBe(1_800_000);
    const resolved = resolveClientOptions({
      baseUrl: 'http://x',
      fetch: stubFetch(),
    });
    expect(resolved).toMatchObject({
      timeoutMs: 120_000,
      triggerTimeoutMs: 1_800_000,
    });
  });
});

describe('resolveClientOptions', () => {
  it('strips trailing slashes and keeps a path prefix', () => {
    const { baseUrl } = resolveClientOptions({
      baseUrl: 'http://127.0.0.1:1937/runner//',
      fetch: stubFetch(),
    });
    expect(baseUrl).toBe('http://127.0.0.1:1937/runner');
  });

  it.each([
    ['not a URL', 'nope'],
    ['a non-http scheme', 'ftp://host'],
    ['a query string', 'http://host?x=1'],
    ['an empty query', 'http://host/?'],
    ['a fragment', 'http://host#top'],
  ])('rejects %s', (_label, baseUrl) => {
    expect(() => resolveClientOptions({ baseUrl, fetch: stubFetch() })).toThrow(
      expect.objectContaining({ code: 'invalid_options', status: 0 }),
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a timeout of %s',
    (value) => {
      expect(() =>
        resolveClientOptions({
          baseUrl: 'http://x',
          timeoutMs: value,
          fetch: stubFetch(),
        }),
      ).toThrow(/timeoutMs must be a positive number/);
      expect(() =>
        resolveClientOptions({
          baseUrl: 'http://x',
          triggerTimeoutMs: value,
          fetch: stubFetch(),
        }),
      ).toThrow(/triggerTimeoutMs must be a positive number/);
    },
  );

  it('rejects a missing fetch', () => {
    vi.stubGlobal('fetch', undefined);
    try {
      expect(() => resolveClientOptions({ baseUrl: 'http://x' })).toThrow(
        /No fetch implementation/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('checkTimeout', () => {
  it('returns a positive timeout', () => {
    expect(checkTimeout('timeoutMs', 5)).toBe(5);
  });
});

describe('captureErrorText', () => {
  it('passes 2xx responses through untouched', async () => {
    const res = new Response('{"ok":true}');
    const texts = new WeakMap<Headers, string>();
    const adapted = captureErrorText(() => Promise.resolve(res), texts);
    expect(await adapted('http://x/status', {})).toBe(res);
  });

  it('keeps a non-2xx body by the returned headers, and still serves it', async () => {
    const texts = new WeakMap<Headers, string>();
    const adapted = captureErrorText(
      () =>
        Promise.resolve(
          new Response('not json', {
            status: 502,
            statusText: 'Bad Gateway',
            headers: { 'x-a': '1' },
          }),
        ),
      texts,
    );
    const res = await adapted(new URL('http://x/jobs'), {});
    expect(res.status).toBe(502);
    expect(res.statusText).toBe('Bad Gateway');
    expect(res.headers.get('x-a')).toBe('1');
    expect(texts.get(res.headers)).toBe('not json');
    expect(await res.text()).toBe('not json');
  });

  it('passes the URL of a Request through', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}')));
    await captureErrorText(
      fetchImpl,
      new WeakMap(),
    )(new Request('http://x/jobs/a'));
    expect(fetchImpl).toHaveBeenCalledWith('http://x/jobs/a', {});
  });
});
