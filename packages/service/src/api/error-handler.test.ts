/**
 * The app error handler: Fastify's default body for a thrown error, byte for byte, also from inside jeeves' catalog scope (whose 5xx response schema would otherwise reshape it).
 */

import { defineCatalog } from '@karmaniverous/jeeves/catalog';
import { registerCatalogRoutes } from '@karmaniverous/jeeves/fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { fastifyDefaultErrorHandler } from './error-handler.js';

/** An error carrying extra enumerable fields, like node:sqlite's. */
class FieldyError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly statusCode?: number,
  ) {
    super(message);
  }
  /** Enumerable, as node:sqlite sets it. */
  errcode = 1555;
}

const catalog = defineCatalog([
  {
    name: 'boom',
    method: 'GET',
    path: '/boom',
    description: 'Throws',
    response: z.object({ ok: z.boolean() }),
    auth: 'none',
    kind: 'read',
  },
] as const);

let app: FastifyInstance;
let toThrow: Error;

/**
 * App with the handler, a plain route and a catalog route that both throw.
 *
 * @param withHandler - Install the error handler.
 * @returns The ready app.
 */
async function build(withHandler = true): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  if (withHandler) instance.setErrorHandler(fastifyDefaultErrorHandler);
  instance.get('/plain', () => {
    throw toThrow;
  });
  await instance.register(async (child) => {
    await registerCatalogRoutes(child, catalog, {
      boom: () => Promise.reject(toThrow),
    });
  });
  await instance.ready();
  return instance;
}

afterEach(async () => {
  await app.close();
});

describe('fastifyDefaultErrorHandler', () => {
  it.each(['/plain', '/boom'])(
    '%s: 500 { statusCode, code, error, message } in that order',
    async (url) => {
      toThrow = new FieldyError('UNIQUE constraint failed', 'ERR_SQLITE');
      app = await build();
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(res.body).toBe(
        '{"statusCode":500,"code":"ERR_SQLITE","error":"Internal Server Error","message":"UNIQUE constraint failed"}',
      );
    },
  );

  it('omits code when the error has none', async () => {
    toThrow = new Error('plain failure');
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.body).toBe(
      '{"statusCode":500,"error":"Internal Server Error","message":"plain failure"}',
    );
  });

  it("keeps an error's own 4xx status", async () => {
    toThrow = new FieldyError('nope', 'E_NOPE', 418);
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(418);
    expect(res.body).toBe(
      `{"statusCode":418,"code":"E_NOPE","error":"I'm a Teapot","message":"nope"}`,
    );
  });

  it('answers 500 for a status below 400', async () => {
    toThrow = new FieldyError('odd', undefined, 302);
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/plain' });
    expect(res.statusCode).toBe(500);
  });

  it('matches what Fastify itself sends outside the catalog scope', async () => {
    toThrow = new FieldyError('same', 'E_SAME');
    app = await build(false);
    const fastifyOwn = await app.inject({ method: 'GET', url: '/plain' });
    await app.close();
    app = await build();
    const ours = await app.inject({ method: 'GET', url: '/boom' });
    expect(ours.body).toBe(fastifyOwn.body);
    expect(ours.statusCode).toBe(fastifyOwn.statusCode);
  });
});
