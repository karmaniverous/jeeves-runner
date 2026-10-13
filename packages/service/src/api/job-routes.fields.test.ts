/**
 * Tests for job enable/disable, script update and per-job field routes.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../test-utils/db.js';
import { createRouteTestHarness } from '../test-utils/routes.js';

describe('Job state, script and field routes', () => {
  let testDb: TestDb;
  let app: FastifyInstance;

  beforeEach(async () => {
    const harness = await createRouteTestHarness();
    testDb = harness.testDb;
    app = harness.app;
  });

  afterEach(async () => {
    await app.close();
    testDb.cleanup();
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

  it('POST /jobs should accept output_channel, env, and args', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        id: 'full-job',
        name: 'Full Job',
        schedule: '0 * * * *',
        script: '/path/to/script.ts',
        output_channel: 'C123CHAN',
        env: { CUSTOMER: 'vc', MODE: 'live' },
        args: ['--verbose', '--dry-run'],
      },
    });

    expect(response.statusCode).toBe(201);

    const job = testDb.db
      .prepare('SELECT output_channel, env, args FROM jobs WHERE id = ?')
      .get('full-job') as {
      output_channel: string | null;
      env: string | null;
      args: string | null;
    };
    expect(job.output_channel).toBe('C123CHAN');
    expect(JSON.parse(job.env!)).toEqual({ CUSTOMER: 'vc', MODE: 'live' });
    expect(JSON.parse(job.args!)).toEqual(['--verbose', '--dry-run']);
  });

  it('PATCH /jobs/:id should update output_channel, env, and args', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('patch-fields', 'Patch', '0 0 * * *', '/script.js', 1);

    const response = await app.inject({
      method: 'PATCH',
      url: '/jobs/patch-fields',
      payload: {
        output_channel: 'C456CHAN',
        env: { KEY: 'value' },
        args: ['--flag'],
      },
    });

    expect(response.statusCode).toBe(200);

    const job = testDb.db
      .prepare('SELECT output_channel, env, args FROM jobs WHERE id = ?')
      .get('patch-fields') as {
      output_channel: string | null;
      env: string | null;
      args: string | null;
    };
    expect(job.output_channel).toBe('C456CHAN');
    expect(JSON.parse(job.env!)).toEqual({ KEY: 'value' });
    expect(JSON.parse(job.args!)).toEqual(['--flag']);
  });

  it('GET /jobs/:id returns stored env, args, and output_channel', async () => {
    testDb.db
      .prepare(
        `INSERT INTO jobs (id, name, schedule, script, enabled, output_channel, env, args)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'get-fields',
        'Get Fields',
        '0 * * * *',
        '/path/to/script.js',
        1,
        'C789CHAN',
        JSON.stringify({ REGION: 'us-east-1' }),
        JSON.stringify(['--prod']),
      );

    const response = await app.inject({
      method: 'GET',
      url: '/jobs/get-fields',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body) as {
      job: { output_channel: string; env: string; args: string };
    };
    expect(body.job.output_channel).toBe('C789CHAN');
    expect(JSON.parse(body.job.env)).toEqual({ REGION: 'us-east-1' });
    expect(JSON.parse(body.job.args)).toEqual(['--prod']);
  });

  it('GET /jobs/:id returns 404 for unknown job', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/jobs/no-such-job',
    });

    expect(response.statusCode).toBe(404);
  });
});
