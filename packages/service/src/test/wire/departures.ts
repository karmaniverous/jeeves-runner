/**
 * @module test/wire/departures
 * The closed list of approved wire departures from the 0.14.0-0 baseline (DD#87 item a): scenarios whose request fails a catalog schema and now gets jeeves' uniform 400, and `limit` values `parseInt` read differently from the catalog's number coercion (still 200, other rows). Pure data.
 */

import type { CatalogValidationIssue } from '@karmaniverous/jeeves/fastify';

/** One approved departure. */
export interface WireDeparture {
  /** What 0.14.0-0 answered, and why. */
  before: string;
  /**
   * Slot and field of the first validation issue the uniform 400 must name;
   * absent for a `limit` that is now read as a different number (200).
   */
  issue?: Pick<CatalogValidationIssue, 'slot' | 'path'>;
}

const body = (...path: string[]) => ({ slot: 'body' as const, path });
const query = (...path: string[]) => ({ slot: 'query' as const, path });

/** `limit` read by `parseInt`, so malformed values were truncated or failed in SQLite. */
const limit = (before: string): WireDeparture => ({
  before,
  issue: query('limit'),
});

/** Approved departures by scenario name (DD#87 item a). */
export const WIRE_DEPARTURES: Readonly<Partial<Record<string, WireDeparture>>> =
  {
    'configApply empty body': {
      before: '500: the handler read Object.keys(undefined)',
      issue: body('patch'),
    },
    'configApply non-object patch': {
      before: '200: an array patch was merged as an object',
      issue: body('patch'),
    },
    'configApply no body': {
      before: '500: the route read request.body.patch',
      issue: body(),
    },
    'createJob invalid body': {
      before: "400 { error: <ZodError message> } from the route's own parse",
      issue: body('name'),
    },
    'createJob no body': {
      before: "400 { error: <ZodError message> } from the route's own parse",
      issue: body(),
    },
    'updateJob invalid body': {
      before: "400 { error: <ZodError message> } from the route's own parse",
      issue: body('name'),
    },
    'updateJob invalid body not found': {
      before: '400 (validation before the 404), ZodError message',
      issue: body('name'),
    },
    'updateJob no body': {
      before: "400 { error: <ZodError message> } from the route's own parse",
      issue: body(),
    },
    'updateScript invalid body': {
      before: "400 { error: <ZodError message> } from the route's own parse",
      issue: body('script'),
    },
    'updateScript bad source_type': {
      before: "400 { error: <ZodError message> } from the route's own parse",
      issue: body('source_type'),
    },
    'jobRuns limit negative': limit('200: LIMIT -1 returned every run'),
    'jobRuns limit not a number': limit(
      '500: LIMIT NaN, SQLite datatype mismatch',
    ),
    'jobRuns limit fraction': limit('200: parseInt read 1.5 as 1'),
    'jobRuns limit trailing text': limit('200: parseInt read 1abc as 1'),
    'jobRuns repeated limit': limit('200: parseInt read [1, 2] as 1'),
    'jobRuns limit empty': limit('500: LIMIT NaN, SQLite datatype mismatch'),
    'queuePeek limit not a number': limit(
      '500: LIMIT NaN, SQLite datatype mismatch',
    ),
    'queuePeek limit empty': limit('500: LIMIT NaN, SQLite datatype mismatch'),
    'queuePeek limit zero': limit('200: LIMIT 0 returned no items'),
    'queryCollection limit not a number': limit(
      '500: LIMIT NaN, SQLite datatype mismatch',
    ),
    'jobRuns limit zero': limit('200: LIMIT 0 returned no runs'),
    'queuePeek limit hex': {
      before: '200: parseInt read 0x1 as 0 (no items); now read as 1',
    },
    'jobRuns limit exponent': {
      before: '200: parseInt read 1e1 as 1 (one run); now read as 10',
    },
    'queryCollection limit zero': limit('200: LIMIT 0 returned no items'),
    'queryCollection limit negative': limit(
      '200: LIMIT -1 returned every item',
    ),
    'queryCollection order other': {
      before: '200: any order other than asc read as desc',
      issue: query('order'),
    },
  };
