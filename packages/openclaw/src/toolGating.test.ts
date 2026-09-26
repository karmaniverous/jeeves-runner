/**
 * Tests for the configRoot tool classification.
 *
 * @module toolGating.test
 */

import { describe, expect, it } from 'vitest';

import { CONFIG_ROOT_READERS } from './toolGating.js';

describe('CONFIG_ROOT_READERS', () => {
  it('lists only runner_service', () => {
    expect(Object.keys(CONFIG_ROOT_READERS)).toEqual(['runner_service']);
  });

  it.each([
    ['install', true],
    ['uninstall', false],
    ['start', false],
    ['stop', false],
    ['restart', false],
    ['status', false],
  ])('runner_service %s reads configRoot: %s', (action, expected) => {
    expect(CONFIG_ROOT_READERS.runner_service?.({ action })).toBe(expected);
  });
});
