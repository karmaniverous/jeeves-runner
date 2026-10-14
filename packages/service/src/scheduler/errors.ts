/**
 * Typed errors thrown by the scheduler, so callers (the HTTP API) can map
 * them to responses without matching on message text (#118).
 *
 * @module
 */

/** No job with the requested id exists. */
export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
  }
}

/** A run was refused because `maxConcurrency` jobs are already running. */
export class MaxConcurrencyError extends Error {
  constructor() {
    super('Max concurrency reached');
    this.name = 'MaxConcurrencyError';
  }
}
