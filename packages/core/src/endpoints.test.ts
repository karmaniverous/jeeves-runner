import { describe, expect, it } from 'vitest';

import { getEndpoint, RUNNER_ENDPOINTS } from './endpoints.js';

describe('RUNNER_ENDPOINTS', () => {
  it('should have 19 endpoints', () => {
    expect(RUNNER_ENDPOINTS).toHaveLength(19);
  });

  it('should have unique names', () => {
    const names = RUNNER_ENDPOINTS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should have non-empty descriptions', () => {
    for (const ep of RUNNER_ENDPOINTS) {
      expect(ep.description.length).toBeGreaterThan(0);
    }
  });

  it('should have valid HTTP methods', () => {
    const validMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    for (const ep of RUNNER_ENDPOINTS) {
      expect(validMethods.has(ep.method)).toBe(true);
    }
  });

  it('should have paths starting with /', () => {
    for (const ep of RUNNER_ENDPOINTS) {
      expect(ep.path.startsWith('/')).toBe(true);
    }
  });
});

describe('getEndpoint', () => {
  it('should return the correct endpoint by name', () => {
    const ep = getEndpoint('status');
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/status');
  });

  it('should return createJob endpoint', () => {
    const ep = getEndpoint('createJob');
    expect(ep.method).toBe('POST');
    expect(ep.path).toBe('/jobs');
  });

  it('should return deleteJob endpoint', () => {
    const ep = getEndpoint('deleteJob');
    expect(ep.method).toBe('DELETE');
    expect(ep.path).toBe('/jobs/:id');
  });

  it('should throw for unknown endpoint', () => {
    expect(() =>
      getEndpoint('nonexistent' as Parameters<typeof getEndpoint>[0]),
    ).toThrow('Unknown endpoint: nonexistent');
  });
});
