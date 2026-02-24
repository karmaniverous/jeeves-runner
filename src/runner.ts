/**
 * Main runner entry point: initializes database, scheduler, and API server.
 *
 * @module
 */

import type { RunnerConfig } from './schemas/config.js';

export interface Runner {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export const createRunner = (_config: RunnerConfig): Promise<Runner> => {
  throw new Error('Not implemented');
};
