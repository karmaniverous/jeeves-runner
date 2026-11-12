/**
 * The runner catalog's job entries (spec 4B.2 entries 4-13), in catalog order: list, create, detail, update, delete, enable, disable, script update, trigger and run history. Bodies reuse the existing job schemas; responses are the rows the routes send (DD#88). Pure.
 *
 * @module catalog/jobEntries
 */

import { z } from 'zod';

import {
  createJobSchema,
  updateJobSchema,
  updateScriptSchema,
} from '../schemas.js';
import { jobIdParamsSchema, limitQuery, route } from './route.js';
import {
  executionResultSchema,
  jobListRowSchema,
  jobRowSchema,
  okResponseSchema,
  runRowSchema,
} from './rows.js';

/** The job entries. */
export const JOB_ENTRIES = [
  {
    ...route('listJobs', 'GET', '/jobs'),
    response: z.object({ jobs: z.array(jobListRowSchema) }),
    kind: 'read',
  },
  {
    ...route('createJob', 'POST', '/jobs'),
    body: createJobSchema,
    response: z.object({ ok: z.literal(true), id: z.string() }),
    kind: 'write',
  },
  {
    ...route('jobDetail', 'GET', '/jobs/:id'),
    params: jobIdParamsSchema,
    response: z.object({ job: jobRowSchema }),
    kind: 'read',
  },
  {
    ...route('updateJob', 'PATCH', '/jobs/:id'),
    params: jobIdParamsSchema,
    body: updateJobSchema,
    response: okResponseSchema,
    kind: 'write',
  },
  {
    ...route('deleteJob', 'DELETE', '/jobs/:id'),
    params: jobIdParamsSchema,
    response: okResponseSchema,
    kind: 'destructive',
  },
  {
    ...route('enableJob', 'PATCH', '/jobs/:id/enable'),
    params: jobIdParamsSchema,
    response: okResponseSchema,
    kind: 'write',
  },
  {
    ...route('disableJob', 'PATCH', '/jobs/:id/disable'),
    params: jobIdParamsSchema,
    response: okResponseSchema,
    kind: 'write',
  },
  {
    ...route('updateScript', 'PUT', '/jobs/:id/script'),
    params: jobIdParamsSchema,
    body: updateScriptSchema,
    response: okResponseSchema,
    kind: 'write',
  },
  {
    ...route('triggerJob', 'POST', '/jobs/:id/run'),
    params: jobIdParamsSchema,
    response: z.object({ result: executionResultSchema }),
    kind: 'write',
  },
  {
    ...route('jobRuns', 'GET', '/jobs/:id/runs'),
    params: jobIdParamsSchema,
    query: z.object({
      /** Maximum runs to return (default 50). */
      limit: limitQuery('Maximum number of runs to return (default 50).'),
    }),
    response: z.object({ runs: z.array(runRowSchema) }),
    kind: 'read',
  },
] as const;
