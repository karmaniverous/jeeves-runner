/**
 * Job definition schema and types.
 *
 * Delegates to `@karmaniverous/jeeves-runner-core` for the canonical
 * schema definition. Re-exported here for internal consumers.
 */

export {
  type CreateJob,
  createJobSchema,
  type Job,
  jobSchema,
  type UpdateJob,
  updateJobSchema,
  type UpdateScript,
  updateScriptSchema,
} from '@karmaniverous/jeeves-runner-core';
