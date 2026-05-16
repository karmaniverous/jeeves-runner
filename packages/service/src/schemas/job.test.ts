/**
 * Tests for job schema.
 */

import { describe, expect, it } from 'vitest';

import { jobSchema } from './job.js';

describe('jobSchema', () => {
  it('should accept outputChannel as string', () => {
    const result = jobSchema.parse({
      id: 'test-job',
      name: 'Test Job',
      schedule: '*/5 * * * *',
      script: '/path/to/script.js',
      outputChannel: 'C0123456789',
    });

    expect(result.outputChannel).toBe('C0123456789');
  });

  it('should default outputChannel to null', () => {
    const result = jobSchema.parse({
      id: 'test-job',
      name: 'Test Job',
      schedule: '*/5 * * * *',
      script: '/path/to/script.js',
    });

    expect(result.outputChannel).toBeNull();
  });

  it('should accept null outputChannel', () => {
    const result = jobSchema.parse({
      id: 'test-job',
      name: 'Test Job',
      schedule: '*/5 * * * *',
      script: '/path/to/script.js',
      outputChannel: null,
    });

    expect(result.outputChannel).toBeNull();
  });
});
