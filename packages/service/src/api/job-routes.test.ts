/**
 * Tests for job CRUD routes (POST, PATCH, DELETE, enable/disable, script update).
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

  it('PATCH /jobs/:id/enable should enable job', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('patch-enable', 'Patch', '0 0 * * *', 'echo test', 0);

    const response = await app.inject({
      method: 'PATCH',
      url: '/jobs/patch-enable/enable',
    });

    expect(response.statusCode).toBe(200);

    const job = testDb.db
      .prepare('SELECT enabled FROM jobs WHERE id = ?')
      .get('patch-enable') as { enabled: number };
    expect(job.enabled).toBe(1);
  });

  it('PATCH /jobs/:id/disable should disable job', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('patch-disable', 'Patch', '0 0 * * *', 'echo test', 1);

    const response = await app.inject({
      method: 'PATCH',
      url: '/jobs/patch-disable/disable',
    });

    expect(response.statusCode).toBe(200);

    const job = testDb.db
      .prepare('SELECT enabled FROM jobs WHERE id = ?')
      .get('patch-disable') as { enabled: number };
    expect(job.enabled).toBe(0);
  });

  it('PUT /jobs/:id/script should update script path', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('script-update', 'Script', '0 0 * * *', '/old/path.js', 1);

    const response = await app.inject({
      method: 'PUT',
      url: '/jobs/script-update/script',
      payload: { script: '/new/path.js' },
    });

    expect(response.statusCode).toBe(200);

    const job = testDb.db
      .prepare('SELECT script FROM jobs WHERE id = ?')
      .get('script-update') as { script: string };
    expect(job.script).toBe('/new/path.js');
  });

  it('PUT /jobs/:id/script should update to inline', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('inline-update', 'Inline', '0 0 * * *', '/old/path.js', 1);

    const response = await app.inject({
      method: 'PUT',
      url: '/jobs/inline-update/script',
      payload: { script: 'console.log("hi")', source_type: 'inline' },
    });

    expect(response.statusCode).toBe(200);

    const job = testDb.db
      .prepare('SELECT script, source_type FROM jobs WHERE id = ?')
      .get('inline-update') as { script: string; source_type: string };
    expect(job.script).toBe('console.log("hi")');
    expect(job.source_type).toBe('inline');
  });
});
