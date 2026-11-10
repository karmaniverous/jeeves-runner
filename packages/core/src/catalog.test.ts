/**
 * @module catalog.test
 * `RUNNER_CATALOG` (DD#86, spec 4B.2): the 19 entries with their methods, paths, kinds and auth, request schemas that accept today's inputs and reject malformed ones, and the package-entry exports.
 */

import { describe, expect, it } from 'vitest';

import { RUNNER_CATALOG } from './catalog.js';
import * as root from './index.js';
import {
  createJobSchema,
  updateJobSchema,
  updateScriptSchema,
} from './schemas.js';

/** Spec 4B.2: name, method, path and kind of every entry, in catalog order. */
const TABLE = [
  ['status', 'GET', '/status', 'read'],
  ['config', 'GET', '/config', 'read'],
  ['configApply', 'POST', '/config/apply', 'write'],
  ['listJobs', 'GET', '/jobs', 'read'],
  ['createJob', 'POST', '/jobs', 'write'],
  ['jobDetail', 'GET', '/jobs/:id', 'read'],
  ['updateJob', 'PATCH', '/jobs/:id', 'write'],
  ['deleteJob', 'DELETE', '/jobs/:id', 'destructive'],
  ['enableJob', 'PATCH', '/jobs/:id/enable', 'write'],
  ['disableJob', 'PATCH', '/jobs/:id/disable', 'write'],
  ['updateScript', 'PUT', '/jobs/:id/script', 'write'],
  ['triggerJob', 'POST', '/jobs/:id/run', 'write'],
  ['jobRuns', 'GET', '/jobs/:id/runs', 'read'],
  ['listQueues', 'GET', '/queues', 'read'],
  ['queueStatus', 'GET', '/queues/:name/status', 'read'],
  ['queuePeek', 'GET', '/queues/:name/peek', 'read'],
  ['listNamespaces', 'GET', '/state', 'read'],
  ['queryState', 'GET', '/state/:namespace', 'read'],
  ['queryCollection', 'GET', '/state/:namespace/:key', 'read'],
] as const;

describe('RUNNER_CATALOG', () => {
  it('holds the 19 entries of spec 4B.2, in order', () => {
    expect(
      RUNNER_CATALOG.entries.map((e) => [e.name, e.method, e.path, e.kind]),
    ).toEqual(TABLE.map((row) => [...row]));
  });

  it('declares no auth on any entry (the runner has none)', () => {
    for (const e of RUNNER_CATALOG.entries) expect(e.auth).toBe('none');
  });

  it('reuses the existing job body schemas', () => {
    expect(RUNNER_CATALOG.byName('createJob').body).toBe(createJobSchema);
    expect(RUNNER_CATALOG.byName('updateJob').body).toBe(updateJobSchema);
    expect(RUNNER_CATALOG.byName('updateScript').body).toBe(updateScriptSchema);
  });

  it('declares no body on enable, disable and trigger (any body is ignored)', () => {
    for (const name of ['enableJob', 'disableJob', 'triggerJob'] as const) {
      expect(RUNNER_CATALOG.byName(name)).not.toHaveProperty('body');
    }
  });

  it('types the status health block as the runner health', () => {
    const health = {
      totalJobs: 2,
      running: 1,
      failedRegistrations: 0,
      okLastHour: 3,
      errorsLastHour: 1,
    };
    const status = {
      name: 'runner',
      version: '1.0.0',
      uptime: 5,
      status: 'healthy',
      health,
    };
    expect(
      RUNNER_CATALOG.byName('status').response.parse(status),
    ).toMatchObject({ health });
    expect(
      RUNNER_CATALOG.byName('status').response.safeParse({
        ...status,
        health: { totalJobs: 'two' },
      }).success,
    ).toBe(false);
  });

  it('is exported from the package entry with its schemas', () => {
    expect(root.RUNNER_CATALOG).toBe(RUNNER_CATALOG);
    expect(root.executionResultSchema).toBeDefined();
    expect(root.jobRowSchema).toBeDefined();
  });
});

describe('request schemas', () => {
  const QUERIES = {
    jobRuns: RUNNER_CATALOG.byName('jobRuns').query,
    queuePeek: RUNNER_CATALOG.byName('queuePeek').query,
    queryCollection: RUNNER_CATALOG.byName('queryCollection').query,
  };
  const query =
    (name: keyof typeof QUERIES) => (input: Record<string, string>) =>
      QUERIES[name].safeParse(input);

  it.each(['jobRuns', 'queuePeek', 'queryCollection'] as const)(
    '%s coerces an integer limit and rejects anything else',
    (name) => {
      const parse = query(name);
      expect(parse({ limit: '5' })).toMatchObject({ data: { limit: 5 } });
      expect(parse({ limit: '-1' })).toMatchObject({ data: { limit: -1 } });
      expect(parse({})).toMatchObject({ success: true, data: {} });
      for (const limit of ['abc', '1.5', '1abc']) {
        expect(parse({ limit }).success).toBe(false);
      }
    },
  );

  it('queryCollection accepts order asc/desc only, and a path', () => {
    const parse = query('queryCollection');
    expect(parse({ order: 'asc', path: '$.count' })).toMatchObject({
      data: { order: 'asc', path: '$.count' },
    });
    expect(parse({ order: 'desc' }).success).toBe(true);
    expect(parse({ order: 'sideways' }).success).toBe(false);
  });

  it('job routes take the job id as the :id param', () => {
    const params = RUNNER_CATALOG.byName('triggerJob').params;
    expect(params.parse({ id: 'a b' })).toEqual({ id: 'a b' });
    expect(params.safeParse({}).success).toBe(false);
  });
});
