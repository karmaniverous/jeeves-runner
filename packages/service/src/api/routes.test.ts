/**
 * Tests for API routes using fastify.inject().
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Scheduler } from '../scheduler/scheduler.js';
import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import { registerRoutes } from './routes.js';

describe('API routes', () => {
  let testDb: TestDb;
  let app: FastifyInstance;
  let mockScheduler: Scheduler;
  let triggerJobMock: Scheduler['triggerJob'];
  let reconcileNowMock: Scheduler['reconcileNow'];

  beforeEach(async () => {
    testDb = createTestDb();

    // Create mock functions
    triggerJobMock = vi.fn(() =>
      Promise.resolve({
        status: 'ok' as const,
        durationMs: 100,
        exitCode: 0,
        tokens: null,
        resultMeta: null,
        error: null,
        stdoutTail: '',
        stderrTail: '',
      }),
    );
    reconcileNowMock = vi.fn();

    // Create mock scheduler
    mockScheduler = {
      start: vi.fn(),
      stop: vi.fn(() => Promise.resolve()),
      triggerJob: triggerJobMock,
      reconcileNow: reconcileNowMock,
      getRunningJobs: vi.fn(() => []),
      getFailedRegistrations: vi.fn(() => []),
    };

    app = Fastify({ logger: false });
    registerRoutes(app, { db: testDb.db, scheduler: mockScheduler });
    await app.ready();
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
    expect(triggerJobMock).toHaveBeenCalledWith('test-job');
  });

  it('POST /jobs/:id/run should return 404 for missing job', async () => {
    triggerJobMock = vi.fn(() =>
      Promise.reject(new Error('Job not found: nonexistent')),
    );
    mockScheduler.triggerJob = triggerJobMock;

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

  it('PUT /jobs/:id/enable should enable job', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('test-job', 'Test Job', '0 0 * * *', 'echo test', 0);

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/test-job/enable',
    });

    expect(response.statusCode).toBe(200);
    expect(reconcileNowMock).toHaveBeenCalled();

    // Verify job is enabled
    const job = testDb.db
      .prepare('SELECT enabled FROM jobs WHERE id = ?')
      .get('test-job') as { enabled: number };
    expect(job.enabled).toBe(1);
  });

  it('PUT /jobs/:id/disable should disable job', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('test-job', 'Test Job', '0 0 * * *', 'echo test', 1);

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/test-job/disable',
    });

    expect(response.statusCode).toBe(200);
    expect(reconcileNowMock).toHaveBeenCalled();

    // Verify job is disabled
    const job = testDb.db
      .prepare('SELECT enabled FROM jobs WHERE id = ?')
      .get('test-job') as { enabled: number };
    expect(job.enabled).toBe(0);
  });

  it('PUT /jobs/:id/enable should return 404 for missing job', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs/nonexistent/enable',
    });

    expect(response.statusCode).toBe(404);
  });

  it('PUT /jobs/:id/disable should return 404 for missing job', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs/nonexistent/disable',
    });

    expect(response.statusCode).toBe(404);
  });
});
