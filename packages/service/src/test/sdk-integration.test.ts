/**
 * The SDK against the real Fastify app on a loopback port (spec 4B.5 B6): a round trip through every catalog entry, `triggerJob` failures keeping their HTTP status (404/409/500, DD#80), and invalid input refused before anything is sent.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createRunnerClient,
  type RunnerClient,
  RunnerError,
} from '@karmaniverous/jeeves-runner-sdk';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { JobNotFoundError, MaxConcurrencyError } from '../scheduler/errors.js';
import type { TestDb } from '../test-utils/db.js';
import type { createMockScheduler } from '../test-utils/routes.js';
import { createRouteTestHarness } from '../test-utils/routes.js';

let testDb: TestDb;
let app: FastifyInstance;
let scheduler: ReturnType<typeof createMockScheduler>;
let runner: RunnerClient;
let dir: string;
const fetchSpy = vi.fn(fetch);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jeeves-runner-sdk-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, '{}');
  ({ testDb, app, scheduler } = await createRouteTestHarness({ configPath }));
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  runner = createRunnerClient({ baseUrl: address, fetch: fetchSpy });
});

afterAll(async () => {
  await app.close();
  testDb.cleanup();
  rmSync(dir, { recursive: true, force: true });
});

const JOB = {
  id: 'sdk-job',
  name: 'SDK job',
  schedule: '0 * * * *',
  script: '/s.js',
};

describe('SDK round trip through every entry', () => {
  it('status, config and configApply', async () => {
    const status = await runner.status();
    expect(status).toMatchObject({ name: 'runner', status: 'healthy' });
    expect(status.health.totalJobs).toBe(0);

    await expect(runner.config({ path: '$.port' })).resolves.toEqual({
      result: [1937],
      count: 1,
    });
    await expect(
      runner.configApply({ patch: { maxConcurrency: 3 } }),
    ).resolves.toMatchObject({ applied: true });
  });

  it('creates, reads, changes and deletes a job', async () => {
    await expect(runner.createJob(JOB)).resolves.toEqual({
      ok: true,
      id: 'sdk-job',
    });
    const { jobs } = await runner.listJobs();
    expect(jobs.map((j) => j.id)).toEqual(['sdk-job']);
    expect(jobs[0]?.last_status).toBeNull();

    await expect(
      runner.updateJob({ id: 'sdk-job', name: 'Renamed' }),
    ).resolves.toEqual({ ok: true });
    await expect(runner.disableJob({ id: 'sdk-job' })).resolves.toEqual({
      ok: true,
    });
    await expect(
      runner.updateScript({
        id: 'sdk-job',
        script: 'x',
        source_type: 'inline',
      }),
    ).resolves.toEqual({ ok: true });
    const { job } = await runner.jobDetail({ id: 'sdk-job' });
    expect(job).toMatchObject({
      name: 'Renamed',
      enabled: 0,
      script: 'x',
      source_type: 'inline',
    });
    await expect(runner.enableJob({ id: 'sdk-job' })).resolves.toEqual({
      ok: true,
    });

    const { result } = await runner.triggerJob({ id: 'sdk-job' });
    expect(result.status).toBe('ok');

    testDb.db
      .prepare(
        "INSERT INTO runs (job_id, status, started_at, trigger) VALUES ('sdk-job', 'ok', '2026-01-01 00:00:00', 'manual'), ('sdk-job', 'error', '2026-01-02 00:00:00', 'manual')",
      )
      .run();
    const { runs } = await runner.jobRuns({ id: 'sdk-job', limit: 1 });
    expect(runs.map((r) => r.status)).toEqual(['error']);

    await expect(runner.deleteJob({ id: 'sdk-job' })).resolves.toEqual({
      ok: true,
    });
  });

  it('inspects queues and state', async () => {
    testDb.db.exec(`
      INSERT INTO queue_items (queue_id, payload, status) VALUES ('q/1', '{"n":1}', 'pending');
      INSERT INTO state (namespace, key, value) VALUES ('ns', 'k', 'v'), ('ns', 'coll', NULL);
      INSERT INTO state_items (namespace, key, item_key, value) VALUES ('ns', 'coll', 'i1', 'x');
    `);
    await expect(runner.listQueues()).resolves.toEqual({ queues: ['q/1'] });
    await expect(runner.queueStatus({ name: 'q/1' })).resolves.toMatchObject({
      depth: 1,
      claimedCount: 0,
      failedCount: 0,
    });
    const { items } = await runner.queuePeek({ name: 'q/1', limit: 5 });
    expect(items.map((i) => i.payload)).toEqual([{ n: 1 }]);
    await expect(runner.listNamespaces()).resolves.toEqual({
      namespaces: ['ns'],
    });
    await expect(runner.queryState({ namespace: 'ns' })).resolves.toEqual({
      k: 'v',
      coll: null,
    });
    await expect(
      runner.queryState({ namespace: 'ns', path: '$.k' }),
    ).resolves.toEqual({ result: ['v'], count: 1 });
    await expect(
      runner.queryCollection({ namespace: 'ns', key: 'coll', order: 'asc' }),
    ).resolves.toMatchObject({ value: null, count: 1 });
  });
});

describe('triggerJob failures keep their HTTP status', () => {
  it.each([
    [new JobNotFoundError('nope'), 404, 'Job not found: nope'],
    [new MaxConcurrencyError(), 409, 'Max concurrency'],
    [new Error('database is locked'), 500, 'database is locked'],
  ] as const)('%s -> %i', async (thrown, status, message) => {
    vi.mocked(scheduler.triggerJobMock).mockRejectedValueOnce(thrown);
    const err = await runner
      .triggerJob({ id: 'nope' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunnerError);
    expect(err).toMatchObject({ status, code: `http_${String(status)}` });
    expect((err as RunnerError).body?.error).toContain(message);
    expect((err as RunnerError).responseText).toBe(
      JSON.stringify({ error: thrown.message }),
    );
  });
});

describe('invalid input', () => {
  it('is refused before anything is sent', async () => {
    fetchSpy.mockClear();
    await expect(runner.jobRuns({ id: 'x', limit: 1.5 })).rejects.toMatchObject(
      { code: 'invalid_request', status: 0 },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
