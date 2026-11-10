/**
 * @module test/wire/departures
 * The closed list of approved wire departures from the 0.14.0-0 baseline (DD#87 item a): scenarios whose request fails a catalog schema and now gets jeeves' uniform 400. Pure data.
 */

import type { CatalogValidationIssue } from '@karmaniverous/jeeves/fastify';

/** One approved departure: the request now fails catalog validation. */
export interface WireDeparture {
  /** Why 0.14.0-0 answered differently (the old behaviour). */
  before: string;
  /** Slot and field of the first validation issue the 400 must name. */
  issue: Pick<CatalogValidationIssue, 'slot' | 'path'>;
}

/** Approved departures by scenario name (DD#87 item a). */
export const WIRE_DEPARTURES: Readonly<Partial<Record<string, WireDeparture>>> =
  {};
