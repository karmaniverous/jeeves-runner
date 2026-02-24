/**
 * Fastify HTTP API server.
 *
 * @module
 */

import type { FastifyInstance } from 'fastify';

import type { RunnerConfig } from '../schemas/config.js';

export const createServer = (
  _config: RunnerConfig,
): Promise<FastifyInstance> => {
  throw new Error('Not implemented');
};
