/**
 * Croner wrapper and job lifecycle management.
 *
 * @module
 */

import type { RunnerConfig } from '../schemas/config.js';

export interface Scheduler {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export const createScheduler = (_config: RunnerConfig): Promise<Scheduler> => {
  throw new Error('Not implemented');
};
