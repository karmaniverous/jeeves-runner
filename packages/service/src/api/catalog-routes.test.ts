/**
 * Catalog wiring of the service (DD#87, DD#88, DD#93): `GET /openapi.json` served without auth, strict response validation, row schemas that match the migrated tables column for column, and the job-age helper.
 */

import {
  jobListRowSchema,
  jobRowSchema,
  RUNNER_OPENAPI_DOCUMENT,
  runRowSchema,
} from '@karmaniverous/jeeves-runner-core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createRouteTestHarness } from '../test-utils/routes.js';
import { ageOf } from './inspect-handlers.js';

let testDb: TestDb;
let app: FastifyInstance;

beforeEach(async () => {
  ({ testDb, app } = await createRouteTestHarness());
});

afterEach(async () => {
  await app.close();
  testDb.cleanup();
});

/** Column names of a table, in order. */
const columnsOf = (table: string) =>
  (
    testDb.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);

describe('GET /openapi.json', () => {
  it('serves the committed document with no credentials', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(JSON.parse(res.body)).toEqual(RUNNER_OPENAPI_DOCUMENT);
  });
});

describe('row schemas against the migrated database', () => {
  it('name every jobs column, in column order', () => {
    expect(Object.keys(jobRowSchema.shape)).toEqual(columnsOf('jobs'));
  });

  it('name every runs column, in column order', () => {
    expect(Object.keys(runRowSchema.shape)).toEqual(columnsOf('runs'));
  });

  it('parse rows written through the API without loss', async () => {
    await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        id: 'j1',
        name: 'J1',
        schedule: '0 * * * *',
        script: '/s.js',
        env: { A: '1' },
        args: ['--x'],
      },
    });
    testDb.db
      .prepare(
        "INSERT INTO runs (job_id, status, trigger) VALUES ('j1', 'ok', 'manual')",
      )
      .run();

    const list = await app.inject({ method: 'GET', url: '/jobs' });
    const [row] = (JSON.parse(list.body) as { jobs: unknown[] }).jobs;
    expect(jobListRowSchema.parse(row)).toEqual(row);

    const runs = await app.inject({ method: 'GET', url: '/jobs/j1/runs' });
    const [run] = (JSON.parse(runs.body) as { runs: unknown[] }).runs;
    expect(runRowSchema.parse(run)).toEqual(run);
  });
});

describe('updateJob', () => {
  it('applies a valid schedule and re-enables the job', async () => {
    testDb.db
      .prepare(
        "INSERT INTO jobs (id, name, schedule, script, enabled) VALUES ('u', 'U', '0 * * * *', '/s.js', 0)",
      )
      .run();
    const res = await app.inject({
      method: 'PATCH',
      url: '/jobs/u',
      payload: { schedule: '*/5 * * * *', enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(
      testDb.db
        .prepare("SELECT schedule, enabled FROM jobs WHERE id = 'u'")
        .get(),
    ).toEqual({ schedule: '*/5 * * * *', enabled: 1 });
  });
});

describe('rows SQLite stores as REAL still answer 200', () => {
  it('a fractional timeout_seconds, then GET /jobs and /jobs/:id', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        id: 'f',
        name: 'F',
        schedule: '0 * * * *',
        script: '/s.js',
        timeout_seconds: 1.0001,
      },
    });
    expect(created.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/jobs' });
    expect(list.statusCode).toBe(200);
    const detail = await app.inject({ method: 'GET', url: '/jobs/f' });
    expect(detail.statusCode).toBe(200);
    expect(
      (JSON.parse(detail.body) as { job: { timeout_ms: number } }).job
        .timeout_ms,
    ).toBeCloseTo(1000.1);
  });

  it('fractional tokens and durations in run history, and a fractional priority', async () => {
    testDb.db.exec(`
      INSERT INTO jobs (id, name, schedule, script) VALUES ('r', 'R', '0 * * * *', '/s.js');
      INSERT INTO runs (job_id, status, duration_ms, tokens, trigger) VALUES ('r', 'ok', 10.5, 12.5, 'manual');
      INSERT INTO queue_items (queue_id, payload, status, priority) VALUES ('q', '1', 'pending', 0.5);
    `);
    const runs = await app.inject({ method: 'GET', url: '/jobs/r/runs' });
    expect(runs.statusCode).toBe(200);
    expect(runs.body).toContain('"tokens":12.5');
    const peek = await app.inject({ method: 'GET', url: '/queues/q/peek' });
    expect(peek.statusCode).toBe(200);
    expect(peek.body).toContain('"priority":0.5');
  });
});

describe('strict response validation (DD#87 item c)', () => {
  it('answers 500 when a row does not match its schema', async () => {
    // SQLite stores whatever it is given: a text `enabled` breaks the row
    // schema, so the route refuses to send it.
    testDb.db
      .prepare(
        "INSERT INTO jobs (id, name, schedule, script, enabled) VALUES ('odd', 'Odd', '* * * * *', '/s.js', 'yes')",
      )
      .run();
    const res = await app.inject({ method: 'GET', url: '/jobs/odd' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({
      code: 'internal_error',
      error: 'Response validation failed',
    });
  });
});

describe('ageOf', () => {
  it('is null without a timestamp or for an unparseable one', () => {
    expect(ageOf(null)).toBeNull();
    expect(ageOf('not a date')).toBeNull();
  });

  it('is the milliseconds since the timestamp', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 0, 1, 0, 0, 5) });
    try {
      expect(ageOf('2026-01-01T00:00:00Z')).toBe(5000);
    } finally {
      vi.useRealTimers();
    }
  });
});
