/**
 * Tests for CLI schedule validation.
 */

import { CronPattern } from 'croner';
import { describe, expect, it } from 'vitest';

describe('schedule validation', () => {
  it('accepts valid cron expressions', () => {
    const validExpressions = [
      '*/5 * * * *',
      '0 0 * * *',
      '0 12 * * MON',
      '0 0 1 * *',
      '*/15 9-17 * * 1-5',
    ];

    for (const expr of validExpressions) {
      expect(() => new CronPattern(expr)).not.toThrow();
    }
  });

  it('rejects invalid cron expressions', () => {
    const invalidExpressions = [
      '*/67 * * * *', // Invalid minute value
      '0 25 * * *', // Invalid hour value
      '0 0 32 * *', // Invalid day of month
      '0 0 * 13 *', // Invalid month
      'not a cron expression',
      '',
    ];

    for (const expr of invalidExpressions) {
      expect(() => new CronPattern(expr)).toThrow();
    }
  });
});
