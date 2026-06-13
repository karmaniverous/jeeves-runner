import { describe, expect, it } from 'vitest';

import {
  createJobSchema,
  jobSchema,
  queueSchema,
  runSchema,
  runTriggerSchema,
  updateJobSchema,
  updateScriptSchema,
} from './schemas.js';

describe('jobSchema', () => {
  it('should parse a minimal job', () => {
    const result = jobSchema.parse({
      id: 'test-job',
      name: 'Test Job',
      schedule: '*/5 * * * *',
      script: '/path/to/script.ts',
    });
    expect(result.id).toBe('test-job');
    expect(result.type).toBe('script');
    expect(result.enabled).toBe(true);
    expect(result.overlapPolicy).toBe('skip');
    expect(result.sourceType).toBe('path');
    expect(result.onFailure).toBeNull();
    expect(result.onSuccess).toBeNull();
    expect(result.outputChannel).toBeNull();
    expect(result.env).toBeUndefined();
    expect(result.args).toBeUndefined();
  });

  it('should parse a job with env and args', () => {
    const result = jobSchema.parse({
      id: 'env-job',
      name: 'Env Job',
      schedule: '0 * * * *',
      script: 'briefing.ts',
      env: { CUSTOMER: 'veterancrowd', MODE: 'live' },
      args: ['--customer', 'veterancrowd', '--live'],
    });
    expect(result.env).toEqual({ CUSTOMER: 'veterancrowd', MODE: 'live' });
    expect(result.args).toEqual(['--customer', 'veterancrowd', '--live']);
  });

  it('should parse a job with all optional fields', () => {
    const result = jobSchema.parse({
      id: 'full-job',
      name: 'Full Job',
      schedule: '0 0 * * *',
      script: 'inline code',
      type: 'session',
      description: 'A full job',
      enabled: false,
      timeoutMs: 30000,
      overlapPolicy: 'allow',
      sourceType: 'inline',
      onFailure: 'C123',
      onSuccess: 'C456',
      outputChannel: 'C789',
      env: { KEY: 'value' },
      args: ['--flag'],
    });
    expect(result.type).toBe('session');
    expect(result.sourceType).toBe('inline');
    expect(result.outputChannel).toBe('C789');
  });
});

describe('createJobSchema', () => {
  it('should parse a minimal create request', () => {
    const result = createJobSchema.parse({
      id: 'new-job',
      name: 'New Job',
      schedule: '*/10 * * * *',
      script: '/path/to/script.ts',
    });
    expect(result.source_type).toBe('path');
    expect(result.type).toBe('script');
    expect(result.overlap_policy).toBe('skip');
    expect(result.enabled).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = createJobSchema.safeParse({ id: 'x' });
    expect(result.success).toBe(false);
  });

  it('should accept env and args', () => {
    const result = createJobSchema.parse({
      id: 'env-job',
      name: 'Env Job',
      schedule: '0 * * * *',
      script: 'test.ts',
      env: { FOO: 'bar' },
      args: ['--live'],
    });
    expect(result.env).toEqual({ FOO: 'bar' });
    expect(result.args).toEqual(['--live']);
  });

  it('should accept output_channel', () => {
    const result = createJobSchema.parse({
      id: 'oc-job',
      name: 'OC Job',
      schedule: '0 * * * *',
      script: 'test.ts',
      output_channel: 'C123',
    });
    expect(result.output_channel).toBe('C123');
  });
});

describe('updateJobSchema', () => {
  it('should accept partial updates', () => {
    const result = updateJobSchema.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('should accept empty object (defaults applied)', () => {
    const result = updateJobSchema.parse({});
    // Partial schema still applies defaults for fields with .default()
    expect(result.source_type).toBe('path');
    expect(result.type).toBe('script');
    expect(result.overlap_policy).toBe('skip');
    expect(result.enabled).toBe(true);
  });

  it('should accept env and args updates', () => {
    const result = updateJobSchema.parse({
      env: { NEW_VAR: 'value' },
      args: ['--new-flag'],
    });
    expect(result.env).toEqual({ NEW_VAR: 'value' });
    expect(result.args).toEqual(['--new-flag']);
  });
});

describe('updateScriptSchema', () => {
  it('should parse script-only update', () => {
    const result = updateScriptSchema.parse({ script: '/new/path.ts' });
    expect(result.script).toBe('/new/path.ts');
    expect(result.source_type).toBeUndefined();
  });

  it('should parse script with source_type', () => {
    const result = updateScriptSchema.parse({
      script: 'console.log("hi")',
      source_type: 'inline',
    });
    expect(result.source_type).toBe('inline');
  });
});

describe('runSchema', () => {
  it('should parse a minimal run', () => {
    const result = runSchema.parse({
      id: 1,
      jobId: 'test-job',
      status: 'ok',
    });
    expect(result.trigger).toBe('schedule');
  });

  it('should accept manual trigger', () => {
    const result = runSchema.parse({
      id: 2,
      jobId: 'test-job',
      status: 'running',
      trigger: 'manual',
    });
    expect(result.trigger).toBe('manual');
  });

  it('should reject retry trigger (removed per DD#46)', () => {
    const result = runTriggerSchema.safeParse('retry');
    expect(result.success).toBe(false);
  });
});

describe('queueSchema', () => {
  it('should parse a minimal queue', () => {
    const result = queueSchema.parse({
      id: 'test-queue',
      name: 'Test Queue',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(result.dedupScope).toBe('pending');
    expect(result.maxAttempts).toBe(1);
    expect(result.retentionDays).toBe(7);
  });
});
