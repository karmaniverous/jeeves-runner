/**
 * @module endpoints.test
 * The deprecated endpoint list (DD#86): still exported from the package entry, tagged `@deprecated`, still working, and held equal to `RUNNER_CATALOG` by name, method and path. Accessed through namespace casts because direct references fail `no-deprecated`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { RUNNER_CATALOG } from './catalog.js';
import { ENDPOINT_DESCRIPTIONS } from './descriptions.js';
import * as endpoints from './endpoints.js';
import * as root from './index.js';

interface LegacyEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
}

const legacy = endpoints as unknown as {
  RUNNER_ENDPOINTS: readonly LegacyEndpoint[];
  getEndpoint: (name: string) => LegacyEndpoint;
};

const source = readFileSync(new URL('./endpoints.ts', import.meta.url), 'utf8');

describe('RUNNER_ENDPOINTS (deprecated)', () => {
  it('matches RUNNER_CATALOG by name, method and path', () => {
    const shape = (e: LegacyEndpoint) => ({
      name: e.name,
      method: e.method,
      path: e.path,
    });
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name);
    expect(legacy.RUNNER_ENDPOINTS.map(shape).sort(byName)).toEqual(
      RUNNER_CATALOG.entries.map(shape).sort(byName),
    );
  });

  it('describes every runner endpoint as its catalog entry does', () => {
    for (const [name, description] of Object.entries(ENDPOINT_DESCRIPTIONS)) {
      expect(legacy.getEndpoint(name).description).toBe(description);
      expect(RUNNER_CATALOG.byName(name as never).description).toBe(
        description,
      );
    }
  });

  it('getEndpoint finds by name and throws for an unknown name', () => {
    expect(legacy.getEndpoint('deleteJob')).toMatchObject({
      method: 'DELETE',
      path: '/jobs/:id',
    });
    expect(() => legacy.getEndpoint('nonexistent')).toThrow(
      'Unknown endpoint: nonexistent',
    );
  });

  it('is exported from the package entry', () => {
    const entry = root as Record<string, unknown>;
    expect(entry.RUNNER_ENDPOINTS).toBe(legacy.RUNNER_ENDPOINTS);
    expect(entry.getEndpoint).toBe(legacy.getEndpoint);
  });

  it.each([
    'export type HttpMethod',
    'export type EndpointDescriptor',
    'export const RUNNER_ENDPOINTS',
    'export type EndpointName',
    'export type Endpoint<',
    'export function getEndpoint',
  ])('tags `%s` @deprecated', (declaration) => {
    const at = source.indexOf(declaration);
    expect(at).toBeGreaterThan(0);
    const doc = source.slice(source.lastIndexOf('/**', at), at);
    expect(doc).toMatch(/@deprecated Use `(RUNNER_CATALOG|Runner)/);
  });

  it('exports nothing but the deprecated aliases', () => {
    expect(Object.keys(endpoints).sort()).toEqual([
      'RUNNER_ENDPOINTS',
      'getEndpoint',
    ]);
  });
});
