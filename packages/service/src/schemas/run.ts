/**
 * Run record schema and types.
 *
 * Delegates to `@karmaniverous/jeeves-runner-core` for the canonical
 * schema definition. Re-exported here for internal consumers.
 */

export {
  type Run,
  runSchema,
  type RunStatus,
  runStatusSchema,
  type RunTrigger,
  runTriggerSchema,
} from '@karmaniverous/jeeves-runner-core';
