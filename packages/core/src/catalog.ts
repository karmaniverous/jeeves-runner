/**
 * The runner's endpoint catalog (`RUNNER_CATALOG`, DD#86): one Zod-described entry per route, from which the service's routes and validation, the OpenAPI document, the SDK client and the plugin's tools are derived; plus the types inferred from it. Pure.
 *
 * @remarks
 * 19 entries: jeeves' three standard entries (`status`, `config`,
 * `configApply`), the job entries and the queue/state entries, in the order
 * of the deprecated `RUNNER_ENDPOINTS` list within each group. Entry names
 * are the operation's one name: catalog entry, SDK method and OpenAPI
 * `operationId`. The runner has no auth, so every entry is `auth: 'none'`.
 *
 * @module catalog
 */

import {
  type CatalogInput,
  type ClientResponse,
  defineCatalog,
  standardEntries,
} from '@karmaniverous/jeeves/catalog';
import type { z } from 'zod';

import { INSPECT_ENTRIES } from './catalog/inspectEntries.js';
import { JOB_ENTRIES } from './catalog/jobEntries.js';
import {
  type executionResultSchema,
  type jobListRowSchema,
  type jobRowSchema,
  runnerHealthSchema,
  type runRowSchema,
} from './catalog/rows.js';

/** The runner endpoint catalog. */
export const RUNNER_CATALOG = defineCatalog([
  ...standardEntries('runner', {
    auth: { config: 'none' },
    healthSchema: runnerHealthSchema,
  }),
  ...JOB_ENTRIES,
  ...INSPECT_ENTRIES,
]);

/** The runner endpoint catalog's type. */
export type RunnerCatalog = typeof RUNNER_CATALOG;

/** Name of a runner catalog entry. */
export type RunnerEntryName = RunnerCatalog['entries'][number]['name'];

/** The catalog entry named `N`. */
export type RunnerEntry<N extends RunnerEntryName> = Extract<
  RunnerCatalog['entries'][number],
  { name: N }
>;

/** Request input of entry `N` (params, query and body fields, flat). */
export type RunnerInput<N extends RunnerEntryName> = CatalogInput<
  RunnerEntry<N>
>;

/** Successful response body of entry `N`. */
export type RunnerResponse<N extends RunnerEntryName> = ClientResponse<
  RunnerEntry<N>
>;

/** A `jobs` row as the routes send it (snake_case, `enabled` 0/1). */
export type JobRow = z.output<typeof jobRowSchema>;

/** A `GET /jobs` row: a job row plus `last_status` and `last_run`. */
export type JobListRow = z.output<typeof jobListRowSchema>;

/** A `runs` row as the routes send it. */
export type RunRow = z.output<typeof runRowSchema>;

/** The result of a finished run (`POST /jobs/:id/run`). */
export type RunResult = z.output<typeof executionResultSchema>;

/** The runner's `health` block in `GET /status`. */
export type RunnerHealth = z.output<typeof runnerHealthSchema>;
