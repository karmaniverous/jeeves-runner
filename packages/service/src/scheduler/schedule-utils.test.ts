/**
 * Tests for schedule-utils: getNextFireTime and validateSchedule.
 */

import { describe, expect, it } from 'vitest';

import { getNextFireTime, validateSchedule } from './schedule-utils.js';

describe('getNextFireTime', () => {
  it('should return a Date for a valid cron expression', () => {
    const result = getNextFireTime('0 0 * * *');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should return a Date for a valid rrstack JSON', () => {
    const rrstack = JSON.stringify({
      timezone: 'UTC',
      timeUnit: 'ms',
      rules: [
        {
          effect: 'event',
          options: { freq: 'daily' },
        },
      ],
    });
    const result = getNextFireTime(rrstack);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(Date.now() - 86_400_000);
  });

  it('should return a future Date for a frequent cron', () => {
    const result = getNextFireTime('*/5 * * * *');
    expect(result).toBeInstanceOf(Date);
  });

  it('should treat bare JSON string as cron (not rrstack)', () => {
    expect(() => getNextFireTime('"hello"')).toThrow();
  });

  it('should treat JSON number as cron (not rrstack)', () => {
    expect(() => getNextFireTime('42')).toThrow();
  });

  it('should treat JSON null as cron (not rrstack)', () => {
    expect(() => getNextFireTime('null')).toThrow();
  });

  it('should treat JSON array as cron (not rrstack)', () => {
    expect(() => getNextFireTime('[1,2,3]')).toThrow();
  });
});

describe('validateSchedule', () => {
  it('should validate a valid cron expression', () => {
    const result = validateSchedule('0 0 * * *');
    expect(result).toEqual({ valid: true, format: 'cron' });
  });

  it('should validate a valid rrstack JSON', () => {
    const rrstack = JSON.stringify({
      timezone: 'UTC',
      timeUnit: 'ms',
      rules: [
        {
          effect: 'event',
          options: { freq: 'daily' },
        },
      ],
    });
    const result = validateSchedule(rrstack);
    expect(result).toEqual({ valid: true, format: 'rrstack' });
  });

  it('should reject an invalid cron expression', () => {
    const result = validateSchedule('not-a-cron');
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain(
      'Invalid cron expression',
    );
  });

  it('should reject invalid rrstack JSON', () => {
    const result = validateSchedule(JSON.stringify({ timezone: 'INVALID/TZ' }));
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain(
      'Invalid RRStack schedule',
    );
  });

  it('should treat bare JSON number as cron', () => {
    const result = validateSchedule('42');
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain(
      'Invalid cron expression',
    );
  });

  it('should treat JSON null as cron', () => {
    const result = validateSchedule('null');
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain(
      'Invalid cron expression',
    );
  });

  it('should treat JSON string as cron', () => {
    const result = validateSchedule('"some-string"');
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain(
      'Invalid cron expression',
    );
  });

  it('should treat JSON array as cron', () => {
    const result = validateSchedule('[1,2,3]');
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain(
      'Invalid cron expression',
    );
  });
});
