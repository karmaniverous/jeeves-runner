/**
 * Job executor - spawns jobs, captures output, updates runs.
 *
 * @module
 */

import type { Job } from '../schemas/job.js';
import type { Run } from '../schemas/run.js';

export const executeJob = (_job: Job): Promise<Run> => {
  throw new Error('Not implemented');
};
