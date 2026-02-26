/**
 * Tests for API routes using fastify.inject().
 */

import Fastify from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Scheduler } from '../scheduler/scheduler.js';
import type { TestDb } from '../test-utils/db.js';
import { createTestDb } from '../test-utils/db.js';
import { registerRoutes } from './routes.js';

describe('API routes', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let mockScheduler: Scheduler;

  beforeEach(() => {
    testDb = createTestDb();

    // Create mock scheduler
    mockScheduler = {
      start: vi.fn(),
      stop: vi.fn(async () => {}),
      triggerJob: vi.fn(async () => ({
        status: 'ok',
        durationMs: 100,
        exitCode: 0,
        tokens: null,
        resultMeta: null,
        error: null,
        stdoutTail: null,
        stderrTail: null,
      })),
      reconcileNow: vi.fn(),
      getRunningJobs: vi.fn(() => []),
      getFailedRegistrations: vi.fn(() => []),
    };

    app = Fastify({ logger: pino({ level: 'silent' }) });
    registerRoutes(app, { db: testDb.db, scheduler: mockScheduler });
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('GET /health should return ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status: string };
    expect(body.status).toBe('ok');
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
    expect(mockScheduler.triggerJob).toHaveBeenCalledWith('test-job');
  });

  it('POST /jobs/:id/run should return 404 for missing job', async () => {
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
      enabledJobs: number;
      runningJobs: number;
    };
    expect(body).toHaveProperty('totalJobs');
    expect(body).toHaveProperty('enabledJobs');
    expect(body).toHaveProperty('runningJobs');
  });

  it('PUT /jobs/:id/enable should enable job', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('test-job', 'Test Job', '0 0 * * *', 'echo test', 0);

    const response = await app.inject({
      method: 'PUT',
      url: '/jobs/test-job/enable',
    });

    expect(response.statusCode).toBe(200);
    expect(mockScheduler.reconcileNow).toHaveBeenCalled();

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
      method: 'PUT',
      url: '/jobs/test-job/disable',
    });

    expect(response.statusCode).toBe(200);
    expect(mockScheduler.reconcileNow).toHaveBeenCalled();

    // Verify job is disabled
    const job = testDb.db
      .prepare('SELECT enabled FROM jobs WHERE id = ?')
      .get('test-job') as { enabled: number };
    expect(job.enabled).toBe(0);
  });

  it('PUT /jobs/:id/enable should return 404 for missing job', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/jobs/nonexistent/enable',
    });

    expect(response.statusCode).toBe(404);
  });

  it('PUT /jobs/:id/disable should return 404 for missing job', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/jobs/nonexistent/disable',
    });

    expect(response.statusCode).toBe(404);
  });
});
