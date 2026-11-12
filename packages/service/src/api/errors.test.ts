/**
 * The runner error contract through the real routes (DD#96, #136): every `RUNNER_*` code answers with its exact body and core's status, library errors a caller should see are mapped, anything else is a masked 500 with no code (catalog and non-catalog routes alike), and a trigger failure's cause is logged, never sent.
 */

import { STATUS_CODES } from 'node:http';
import { Writable } from 'node:stream';

import {
  defineError,
  SERVER_ERROR_MESSAGE,
} from '@karmaniverous/jeeves/fastify';
import {
  RUNNER_ERROR_CODES,
  RUNNER_ERROR_STATUS,
} from '@karmaniverous/jeeves-runner-core';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunnerDescriptor } from '../descriptor.js';
import { JobNotFoundError, MaxConcurrencyError } from '../scheduler/errors.js';
import { runnerConfigSchema } from '../schemas/config.js';
import { createTestDb, type TestDb } from '../test-utils/db.js';
import {
  createMockScheduler,
  createRouteTestHarness,
} from '../test-utils/routes.js';
import {
  capArg,
  InvalidJsonPath,
  InvalidQueuePayload,
  InvalidSchedule,
  JobExists,
  JobNotFound,
  MaxConcurrency,
  MESSAGE_ARG_MAX,
  TriggerFailed,
} from './errors.js';
import { isPrimaryKeyViolation } from './job-handlers.js';
import { registerRoutes } from './routes.js';
import { triggerError } from './run-handlers.js';

let testDb: TestDb;
let app: FastifyInstance;
let scheduler: ReturnType<typeof createMockScheduler>;

beforeEach(async () => {
  ({ testDb, app, scheduler } = await createRouteTestHarness());
  testDb.db.exec(`
    INSERT INTO jobs (id, name, schedule, script) VALUES ('alpha', 'Alpha', '0 0 * * *', '/a.js');
    INSERT INTO queue_items (queue_id, payload, status) VALUES ('broken', 'not json', 'pending');
    INSERT INTO state (namespace, key, value) VALUES ('ns', 'k', 'v');
  `);
});

afterEach(async () => {
  await app.close();
  testDb.cleanup();
});

/**
 * The exact body a runner error is sent with.
 *
 * @param code - A `RUNNER_*` code.
 * @param message - Its message.
 * @returns Fastify's standard body.
 */
const body = (code: keyof typeof RUNNER_ERROR_STATUS, message: string) => {
  const statusCode = RUNNER_ERROR_STATUS[code];
  return { statusCode, code, error: STATUS_CODES[statusCode], message };
};

/** A masked 500: no code, jeeves' generic message. */
const MASKED = {
  statusCode: 500,
  error: 'Internal Server Error',
  message: SERVER_ERROR_MESSAGE,
};

/** Inject and return status and parsed body. */
async function send(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) {
  const res = await app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as unknown };
}

describe('error classes match core RUNNER_ERROR_STATUS', () => {
  const classes = [
    new InvalidSchedule('x'),
    new InvalidJsonPath('x'),
    new InvalidQueuePayload(),
    new JobNotFound('x'),
    new JobExists('x'),
    new MaxConcurrency(),
    new TriggerFailed(),
  ];

  it('one class per code, each with its status', () => {
    expect(classes.map((e) => e.code)).toEqual([...RUNNER_ERROR_CODES]);
    for (const error of classes)
      expect(error.statusCode).toBe(RUNNER_ERROR_STATUS[error.code]);
  });
});

describe('RUNNER_JOB_NOT_FOUND (404)', () => {
  it.each([
    ['GET', '/jobs/nope', undefined],
    ['PATCH', '/jobs/nope', { name: 'x' }],
    ['DELETE', '/jobs/nope', undefined],
    ['PATCH', '/jobs/nope/enable', {}],
    ['PATCH', '/jobs/nope/disable', {}],
    ['PUT', '/jobs/nope/script', { script: 'x' }],
  ] as const)('%s %s', async (method, url, payload) => {
    expect(await send(method, url, payload)).toEqual({
      status: 404,
      body: body('RUNNER_JOB_NOT_FOUND', 'Job not found: nope'),
    });
  });

  it("keeps Fastify's 414 for an id longer than maxParamLength (100)", async () => {
    const { status, body: sent } = await send(
      'GET',
      `/jobs/${'x'.repeat(101)}`,
    );
    expect(status).toBe(414);
    expect(sent).toMatchObject({ code: 'FST_ERR_MAX_PARAM_LENGTH' });
  });
});

describe('capArg', () => {
  it('keeps an argument up to MESSAGE_ARG_MAX characters', () => {
    const id = 'x'.repeat(MESSAGE_ARG_MAX);
    expect(capArg(id)).toBe(id);
  });

  it('cuts a longer one to MESSAGE_ARG_MAX characters, ending in an ellipsis', () => {
    const capped = capArg('x'.repeat(MESSAGE_ARG_MAX + 1));
    expect(capped).toHaveLength(MESSAGE_ARG_MAX);
    expect(capped).toBe(`${'x'.repeat(MESSAGE_ARG_MAX - 1)}…`);
  });

  it('counts and cuts by code points, never splitting a surrogate pair', () => {
    const emoji = '\u{1F600}';
    expect(capArg(emoji.repeat(MESSAGE_ARG_MAX))).toBe(
      emoji.repeat(MESSAGE_ARG_MAX),
    );
    expect(capArg(emoji.repeat(MESSAGE_ARG_MAX + 1))).toBe(
      `${emoji.repeat(MESSAGE_ARG_MAX - 1)}…`,
    );
  });
});

describe('RUNNER_INVALID_SCHEDULE (400)', () => {
  const cronMessage = (schedule: string) =>
    `Invalid cron expression: CronPattern: invalid configuration format ('${schedule}'), exactly five, six, or seven space separated parts are required.`;

  it('createJob with a bad schedule writes nothing', async () => {
    expect(
      await send('POST', '/jobs', {
        id: 'b',
        name: 'B',
        schedule: 'often',
        script: '/b.js',
      }),
    ).toEqual({
      status: 400,
      body: body('RUNNER_INVALID_SCHEDULE', cronMessage('often')),
    });
    expect(testDb.db.prepare("SELECT id FROM jobs WHERE id = 'b'").get()).toBe(
      undefined,
    );
  });

  it('updateJob with a bad schedule leaves the job unchanged', async () => {
    expect(await send('PATCH', '/jobs/alpha', { schedule: 'often' })).toEqual({
      status: 400,
      body: body('RUNNER_INVALID_SCHEDULE', cronMessage('often')),
    });
    expect(
      testDb.db.prepare("SELECT schedule FROM jobs WHERE id = 'alpha'").get(),
    ).toEqual({ schedule: '0 0 * * *' });
  });
});

describe('RUNNER_JOB_EXISTS (409)', () => {
  it('createJob with an existing id keeps the existing job', async () => {
    expect(
      await send('POST', '/jobs', {
        id: 'alpha',
        name: 'Other',
        schedule: '0 1 * * *',
        script: '/o.js',
      }),
    ).toEqual({
      status: 409,
      body: body('RUNNER_JOB_EXISTS', 'Job already exists: alpha'),
    });
    expect(
      testDb.db.prepare("SELECT name FROM jobs WHERE id = 'alpha'").get(),
    ).toEqual({ name: 'Alpha' });
    expect(scheduler.reconcileNowMock).not.toHaveBeenCalled();
  });

  it('caps a long duplicate id in the message', async () => {
    const id = 'y'.repeat(MESSAGE_ARG_MAX + 50);
    testDb.db
      .prepare(
        "INSERT INTO jobs (id, name, schedule, script) VALUES (?, 'L', '0 0 * * *', '/l.js')",
      )
      .run(id);
    expect(
      await send('POST', '/jobs', {
        id,
        name: 'L',
        schedule: '0 0 * * *',
        script: '/l.js',
      }),
    ).toEqual({
      status: 409,
      body: body('RUNNER_JOB_EXISTS', `Job already exists: ${capArg(id)}`),
    });
  });

  it('any other SQLite failure on insert is a masked 500, not a 409', async () => {
    testDb.db.exec(
      "CREATE TRIGGER no_inserts BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'secret detail'); END;",
    );
    expect(
      await send('POST', '/jobs', {
        id: 'new',
        name: 'New',
        schedule: '0 1 * * *',
        script: '/n.js',
      }),
    ).toEqual({ status: 500, body: MASKED });
  });

  it('isPrimaryKeyViolation reads only SQLite errcode 1555', () => {
    expect(isPrimaryKeyViolation({ errcode: 1555 })).toBe(true);
    expect(isPrimaryKeyViolation({ errcode: 2067 })).toBe(false);
    expect(isPrimaryKeyViolation(new Error('x'))).toBe(false);
    expect(isPrimaryKeyViolation(null)).toBe(false);
    expect(isPrimaryKeyViolation('1555')).toBe(false);
  });
});

describe('RUNNER_INVALID_QUEUE_PAYLOAD and RUNNER_INVALID_JSONPATH (400)', () => {
  it('queuePeek on a non-JSON payload', async () => {
    expect(await send('GET', '/queues/broken/peek')).toEqual({
      status: 400,
      body: body(
        'RUNNER_INVALID_QUEUE_PAYLOAD',
        'A pending item in this queue has a payload that is not JSON.',
      ),
    });
  });

  it.each(['/state/ns?path=%24%5B(((', '/state/ns/k?path=%24%5B((('])(
    '%s',
    async (url) => {
      expect(await send('GET', url)).toEqual({
        status: 400,
        body: body(
          'RUNNER_INVALID_JSONPATH',
          'Invalid JSONPath: Unclosed ( at character 3',
        ),
      });
    },
  );
});

describe('triggerJob failures (#118, DD#80, DD#96)', () => {
  it('maps scheduler errors and wraps anything else with its cause', () => {
    expect(triggerError(new JobNotFoundError('j'), 'j')).toBeInstanceOf(
      JobNotFound,
    );
    expect(triggerError(new MaxConcurrencyError(), 'j')).toBeInstanceOf(
      MaxConcurrency,
    );
    const cause = new Error('database is locked');
    const wrapped = triggerError(cause, 'j');
    expect(wrapped).toBeInstanceOf(TriggerFailed);
    expect(wrapped.cause).toBe(cause);
  });
});

describe('anything else is a masked 500 with no code', () => {
  it('a crash in a catalog handler', async () => {
    testDb.db.exec('DROP TABLE runs');
    expect(await send('GET', '/jobs')).toEqual({ status: 500, body: MASKED });
  });
});

describe('logs and non-catalog routes (registerErrorHandlers)', () => {
  /** A Fastify app on the runner routes with a captured error log. */
  async function loggedApp(extra?: (app: FastifyInstance) => void) {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const db = createTestDb();
    const mock = createMockScheduler();
    const logged = Fastify({ logger: { level: 'error', stream } });
    registerRoutes(logged, {
      db: db.db,
      scheduler: mock,
      getConfig: () => runnerConfigSchema.parse({}),
      descriptor: createRunnerDescriptor(),
    });
    extra?.(logged);
    await logged.ready();
    return {
      logged,
      lines,
      mock,
      close: async () => {
        await logged.close();
        db.cleanup();
      },
    };
  }

  it("logs a trigger failure's cause, never sends it", async () => {
    const ctx = await loggedApp();
    try {
      ctx.mock.triggerJob = vi.fn(() =>
        Promise.reject(new Error('gateway token abc123 rejected')),
      );
      const res = await ctx.logged.inject({
        method: 'POST',
        url: '/jobs/j/run',
      });
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain('abc123');
      expect(ctx.lines.join('')).toContain('gateway token abc123 rejected');
    } finally {
      await ctx.close();
    }
  });

  it('a non-catalog route: plain errors masked, defineError errors kept', async () => {
    const Teapot = defineError('RUNNER_TEST_TEAPOT', 'short and stout', 418);
    const ctx = await loggedApp((a) => {
      a.get('/boom', () => {
        throw Object.assign(new Error('internal path C:\\secret'), {
          statusCode: 404,
          code: 'ENOENT',
        });
      });
      a.get('/teapot', () => {
        throw new Teapot();
      });
    });
    try {
      const boom = await ctx.logged.inject({ method: 'GET', url: '/boom' });
      expect([boom.statusCode, JSON.parse(boom.body)]).toEqual([500, MASKED]);
      const teapot = await ctx.logged.inject({ method: 'GET', url: '/teapot' });
      expect([teapot.statusCode, JSON.parse(teapot.body)]).toEqual([
        418,
        {
          statusCode: 418,
          code: 'RUNNER_TEST_TEAPOT',
          error: "I'm a Teapot",
          message: 'short and stout',
        },
      ]);
    } finally {
      await ctx.close();
    }
  });

  it("an unknown route keeps Fastify's 404", async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect([res.statusCode, JSON.parse(res.body)]).toEqual([
      404,
      {
        message: 'Route GET:/nope not found',
        error: 'Not Found',
        statusCode: 404,
      },
    ]);
  });
});
