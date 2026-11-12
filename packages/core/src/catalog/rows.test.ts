/**
 * @module catalog/rows.test
 * Response schemas (DD#88): they accept the bodies the routes send (snake_case rows, nullable columns, JSONPath results) and emit fields in the routes' order; the strict `{ result, count }` branch never swallows a state map.
 */

import { describe, expect, it } from 'vitest';

import { RUNNER_CATALOG } from '../catalog.js';
import {
  collectionBodySchema,
  executionResultSchema,
  jobListRowSchema,
  jobRowSchema,
  queueStatusSchema,
  runRowSchema,
} from './rows.js';

/** A `jobs` row in column order. */
const JOB_ROW = {
  id: 'alpha',
  name: 'Alpha',
  schedule: '0 * * * *',
  script: '/s.js',
  type: 'script',
  description: null,
  enabled: 1,
  timeout_ms: null,
  overlap_policy: 'skip',
  on_failure: null,
  on_success: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  source_type: 'path',
  output_channel: null,
  env: '{"A":"1"}',
  args: null,
};

describe('row schemas', () => {
  it('accept a job row and emit it in column order', () => {
    const shuffled = Object.fromEntries(Object.entries(JOB_ROW).reverse());
    expect(JSON.stringify(jobRowSchema.parse(shuffled))).toBe(
      JSON.stringify(JOB_ROW),
    );
  });

  it('keep enabled numeric and env as JSON text (the wire, not Job)', () => {
    expect(jobRowSchema.safeParse({ ...JOB_ROW, enabled: true }).success).toBe(
      false,
    );
    expect(
      jobRowSchema.safeParse({ ...JOB_ROW, env: { A: '1' } }).success,
    ).toBe(false);
  });

  it('append last_status and last_run to a listed job', () => {
    const row = { ...JOB_ROW, last_status: null, last_run: null };
    expect(Object.keys(jobListRowSchema.parse(row)).slice(-2)).toEqual([
      'last_status',
      'last_run',
    ]);
    expect(jobListRowSchema.safeParse(JOB_ROW).success).toBe(false);
  });

  it('accept a run row with nullable columns', () => {
    const run = {
      id: 1,
      job_id: 'alpha',
      status: 'running',
      started_at: '2026-01-01 00:00:00',
      finished_at: null,
      duration_ms: null,
      exit_code: null,
      tokens: null,
      result_meta: null,
      error: null,
      stdout_tail: null,
      stderr_tail: null,
      trigger: 'schedule',
    };
    expect(runRowSchema.parse(run)).toEqual(run);
    expect(runRowSchema.safeParse({ ...run, id: '1' }).success).toBe(false);
  });

  it('accept an execution result and reject an unknown status', () => {
    const result = {
      status: 'timeout',
      exitCode: null,
      durationMs: 5000,
      tokens: null,
      resultMeta: null,
      stdoutTail: '',
      stderrTail: '',
      error: 'Job timed out after 5000ms',
    };
    expect(executionResultSchema.parse(result)).toEqual(result);
    expect(
      executionResultSchema.safeParse({ ...result, status: 'skipped' }).success,
    ).toBe(false);
  });

  it('accept queue status with and without an oldest age', () => {
    const status = { depth: 5, claimedCount: 2, failedCount: 1, oldestAge: 3 };
    expect(queueStatusSchema.parse(status)).toEqual(status);
    expect(queueStatusSchema.parse({ ...status, oldestAge: null })).toEqual({
      ...status,
      oldestAge: null,
    });
  });

  it('accept a collection body with null values', () => {
    const body = {
      value: null,
      items: [{ itemKey: 'k1', value: null, updatedAt: '2024-01-02' }],
      count: 1,
    };
    expect(collectionBodySchema.parse(body)).toEqual(body);
  });
});

describe('JSONPath responses', () => {
  const state = RUNNER_CATALOG.byName('queryState').response;
  const collection = RUNNER_CATALOG.byName('queryCollection').response;

  it('read { result, count } as a JSONPath result', () => {
    const matches = { result: ['a', { b: 1 }], count: 2 };
    expect(state.parse(matches)).toEqual(matches);
    expect(collection.parse(matches)).toEqual(matches);
  });

  it('never strip a state map whose keys are result and count', () => {
    const map = { result: 'r', count: '2', other: null };
    expect(state.parse(map)).toEqual(map);
    expect(state.parse({ result: 'r', count: '2' })).toEqual({
      result: 'r',
      count: '2',
    });
  });

  it('read a collection body as the collection branch', () => {
    const body = { value: 'v', items: [], count: 0 };
    expect(collection.parse(body)).toEqual(body);
  });
});
