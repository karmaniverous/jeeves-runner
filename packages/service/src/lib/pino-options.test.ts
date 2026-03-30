/**
 * Tests for shared pino logger options builder.
 */

import { describe, expect, it } from 'vitest';

import { buildPinoOptions } from './pino-options.js';

describe('buildPinoOptions', () => {
  it('returns level-only options when no file is configured', () => {
    const result = buildPinoOptions({ level: 'warn' });

    expect(result).toEqual({ level: 'warn' });
    expect(result).not.toHaveProperty('transport');
  });

  it('includes pino/file transport when file is configured', () => {
    const result = buildPinoOptions({
      level: 'info',
      file: '/var/log/runner.log',
    });

    expect(result.level).toBe('info');
    expect(result.transport).toEqual({
      target: 'pino/file',
      options: { destination: '/var/log/runner.log' },
    });
  });

  it('omits transport when file is undefined', () => {
    const result = buildPinoOptions({ level: 'debug', file: undefined });

    expect(result.level).toBe('debug');
    expect(result).not.toHaveProperty('transport');
  });

  it('omits transport when file is empty string', () => {
    const result = buildPinoOptions({ level: 'error', file: '' });

    expect(result.level).toBe('error');
    expect(result).not.toHaveProperty('transport');
  });
});
