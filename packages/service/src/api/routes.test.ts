/**
 * Tests for API routes using fastify.inject().
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import type { createMockScheduler } from '../test-utils/routes.js';
import { createRouteTestHarness } from '../test-utils/routes.js';

describe('API routes', () => {
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

  it('GET /health should return ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('GET /jobs should return empty list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/jobs',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { jobs: unknown[] };
    expect(body.jobs).toEqual([]);
  });

  it('GET /jobs should return job list', async () => {
    // Add a test job
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('test-job', 'Test Job', '0 0 * * *', 'echo test', 1);

    const response = await app.inject({
      method: 'GET',
      url: '/jobs',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      jobs: Array<{ id: string; name: string }>;
    };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]?.id).toBe('test-job');
  });

  it('GET /jobs/:id should return job details', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('test-job', 'Test Job', '0 0 * * *', 'echo test', 1);

    const response = await app.inject({
      method: 'GET',
      url: '/jobs/test-job',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      job: { id: string; name: string };
    };
    expect(body.job.id).toBe('test-job');
    expect(body.job.name).toBe('Test Job');
  });

  it('GET /jobs/:id should return 404 for missing job', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/jobs/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });

  it('POST /jobs/:id/run should trigger job', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('test-job', 'Test Job', '0 0 * * *', 'echo test', 1);

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/test-job/run',
    });

    expect(response.statusCode).toBe(200);
    expect(scheduler.triggerJobMock).toHaveBeenCalledWith('test-job');
  });

  it('POST /jobs/:id/run should return 404 for missing job', async () => {
    scheduler.triggerJob = vi.fn(() =>
      Promise.reject(new Error('Job not found: nonexistent')),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/nonexistent/run',
    });

    expect(response.statusCode).toBe(404);
  });

  it('GET /stats should return statistics', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/stats',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      totalJobs: number;
      running: number;
      failedRegistrations: number;
    };
    expect(body).toHaveProperty('totalJobs');
    expect(body).toHaveProperty('running');
    expect(body).toHaveProperty('failedRegistrations');
  });

  it('GET /config should return full config', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/config',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { port: number };
    expect(body.port).toBe(1937);
  });

  it('GET /config?path=$.port should return query result envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/config?path=$.port',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      result: unknown[];
      count: number;
    };
    expect(body.count).toBe(1);
    expect(body.result).toEqual([1937]);
  });
});
