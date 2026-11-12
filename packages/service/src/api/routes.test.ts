/**
 * Tests for API routes using fastify.inject().
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JobNotFoundError, MaxConcurrencyError } from '../scheduler/errors.js';
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

  it('GET /status should return status with version and health stats', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      name: string;
      version: string;
      uptime: number;
      status: string;
      health: {
        totalJobs: number;
        running: number;
        failedRegistrations: number;
        okLastHour: number;
        errorsLastHour: number;
      };
    };
    expect(body.name).toBe('runner');
    expect(typeof body.version).toBe('string');
    expect(body.status).toBe('healthy');
    expect(body).toHaveProperty('uptime');
    expect(body.health).toHaveProperty('totalJobs');
    expect(body.health).toHaveProperty('running');
    expect(body.health).toHaveProperty('failedRegistrations');
    expect(body.health).toHaveProperty('okLastHour');
    expect(body.health).toHaveProperty('errorsLastHour');
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

  it.each([
    [
      '404 RUNNER_JOB_NOT_FOUND for a missing job',
      new JobNotFoundError('nonexistent'),
      {
        statusCode: 404,
        code: 'RUNNER_JOB_NOT_FOUND',
        error: 'Not Found',
        message: 'Job not found: nonexistent',
      },
    ],
    [
      '409 RUNNER_MAX_CONCURRENCY when refused at maxConcurrency',
      new MaxConcurrencyError(),
      {
        statusCode: 409,
        code: 'RUNNER_MAX_CONCURRENCY',
        error: 'Conflict',
        message: 'Max concurrency reached; retry when a running job finishes.',
      },
    ],
    [
      '500 RUNNER_TRIGGER_FAILED, without the cause, for any other failure',
      new Error('gateway unavailable at http://10.0.0.1:18789'),
      {
        statusCode: 500,
        code: 'RUNNER_TRIGGER_FAILED',
        error: 'Internal Server Error',
        message:
          'The job could not be run; the cause is in the runner log and on the run, if it started.',
      },
    ],
  ])(
    'POST /jobs/:id/run returns %s (#118, DD#96)',
    async (_label, error, body) => {
      scheduler.triggerJob = vi.fn(() => Promise.reject(error));

      const response = await app.inject({
        method: 'POST',
        url: '/jobs/nonexistent/run',
      });

      expect(response.statusCode).toBe(body.statusCode);
      expect(JSON.parse(response.body)).toEqual(body);
    },
  );

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
