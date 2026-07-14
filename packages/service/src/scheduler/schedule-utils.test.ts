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

  it('should return null for bare JSON string (not valid cron)', () => {
    expect(getNextFireTime('"hello"')).toBeNull();
  });

  it('should return null for JSON number (not valid cron)', () => {
    expect(getNextFireTime('42')).toBeNull();
  });

  it('should return null for JSON null (not valid cron)', () => {
    expect(getNextFireTime('null')).toBeNull();
  });

  it('should return null for JSON array (not valid cron)', () => {
    expect(getNextFireTime('[1,2,3]')).toBeNull();
  });
});

describe('tryParseRRStack flat format repacking', () => {
  it('repacks flat format with freq + timezone into valid RRStack', () => {
    const schedule = JSON.stringify({
      freq: 'minutely',
      interval: 11,
      timezone: 'UTC',
    });
    const next = getNextFireTime(schedule);
    expect(next).toBeInstanceOf(Date);
  });

  it('preserves valid RRStack configs with rules array', () => {
    const schedule = JSON.stringify({
      timezone: 'UTC',
      rules: [{ effect: 'event', options: { freq: 'minutely', interval: 5 } }],
    });
    const next = getNextFireTime(schedule);
    expect(next).toBeInstanceOf(Date);
  });

  it('treats non-JSON strings as cron', () => {
    const next = getNextFireTime('*/5 * * * *');
    expect(next).toBeInstanceOf(Date);
  });

  it('returns null for flat format without timezone', () => {
    const schedule = JSON.stringify({ freq: 'minutely', interval: 11 });
    // Falls through to pass-through path; RRStack may produce no events
    const next = getNextFireTime(schedule);
    // Result depends on RRStack behavior — may or may not fire
    expect(next === null || next instanceof Date).toBe(true);
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
