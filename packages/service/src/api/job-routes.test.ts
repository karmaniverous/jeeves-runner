/**
 * Tests for job CRUD routes (POST, PATCH, DELETE).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import type { createMockScheduler } from '../test-utils/routes.js';
import { createRouteTestHarness } from '../test-utils/routes.js';

describe('Job CRUD routes', () => {
  let testDb: TestDb;
  let app: FastifyInstance;
  let scheduler: ReturnType<typeof createMockScheduler>;

  beforeEach(async () => {
    const harness = await createRouteTestHarness();
    testDb = harness.testDb;
    app = harness.app;
    scheduler = harness.scheduler;
  });

  afterEach(async () => {
    await app.close();
    testDb.cleanup();
  });

  // --- Phase 2: Job CRUD tests ---

  it('POST /jobs should create a job with valid cron', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        id: 'new-job',
        name: 'New Job',
        schedule: '*/5 * * * *',
        script: '/path/to/script.js',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(scheduler.reconcileNowMock).toHaveBeenCalled();

    const job = testDb.db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get('new-job') as { id: string; name: string };
    expect(job.name).toBe('New Job');
  });

  it('POST /jobs should create a job with valid rrstack JSON', async () => {
    const rrstack = JSON.stringify({
      timezone: 'UTC',
      timeUnit: 'ms',
      rules: [{ effect: 'event', options: { freq: 'daily' } }],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        id: 'rrstack-job',
        name: 'RRStack Job',
        schedule: rrstack,
        script: '/path/to/script.js',
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('POST /jobs should reject invalid schedule', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        id: 'bad-schedule',
        name: 'Bad',
        schedule: 'not-valid',
        script: '/path/to/script.js',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /jobs should reject missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: { id: 'missing-fields' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('PATCH /jobs/:id should update an existing job', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('update-me', 'Original', '0 0 * * *', 'echo test', 1);

    const response = await app.inject({
      method: 'PATCH',
      url: '/jobs/update-me',
      payload: { name: 'Updated Name' },
    });

    expect(response.statusCode).toBe(200);
    expect(scheduler.reconcileNowMock).toHaveBeenCalled();

    const job = testDb.db
      .prepare('SELECT name FROM jobs WHERE id = ?')
      .get('update-me') as { name: string };
    expect(job.name).toBe('Updated Name');
  });

  it('PATCH /jobs/:id should leave omitted fields unchanged (#114)', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled, overlap_policy, type, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'keep-disabled',
        'Original',
        '0 0 * * *',
        'echo test',
        0,
        'allow',
        'session',
        'inline',
      );

    const response = await app.inject({
      method: 'PATCH',
      url: '/jobs/keep-disabled',
      payload: { name: 'Renamed' },
    });

    expect(response.statusCode).toBe(200);

    const job = testDb.db
      .prepare(
        'SELECT name, enabled, overlap_policy, type, source_type FROM jobs WHERE id = ?',
      )
      .get('keep-disabled') as {
      name: string;
      enabled: number;
      overlap_policy: string;
      type: string;
      source_type: string;
    };
    expect(job).toEqual({
      name: 'Renamed',
      enabled: 0,
      overlap_policy: 'allow',
      type: 'session',
      source_type: 'inline',
    });
  });

  it('PATCH /jobs/:id should return 404 for missing job', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/jobs/nonexistent',
      payload: { name: 'Nope' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('DELETE /jobs/:id should delete job and cascade runs', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('delete-me', 'Delete Me', '0 0 * * *', 'echo test', 1);
    testDb.db
      .prepare(
        `INSERT INTO runs (job_id, status, started_at, trigger)
         VALUES (?, ?, datetime('now'), ?)`,
      )
      .run('delete-me', 'ok', 'manual');

    const response = await app.inject({
      method: 'DELETE',
      url: '/jobs/delete-me',
    });

    expect(response.statusCode).toBe(200);
    expect(scheduler.reconcileNowMock).toHaveBeenCalled();

    const runs = testDb.db
      .prepare('SELECT COUNT(*) as count FROM runs WHERE job_id = ?')
      .get('delete-me') as { count: number };
    expect(runs.count).toBe(0);
  });

  it('DELETE /jobs/:id should return 404 for missing', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/jobs/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });
});
