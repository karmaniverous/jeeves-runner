/**
 * @module test/wire/wireTypes
 * Shapes of a wire scenario and its recorded reply, and the builders the scenario lists use. Pure.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { WireState } from './wireApp.js';

/** What a client sees for one request. */
export interface WireRecord {
  /** HTTP status. */
  status: number;
  /** `content-type` header. */
  contentType?: string;
  /** Body text, byte for byte (volatile values normalised). */
  body: string;
}

/** HTTP methods the scenarios use. */
export type WireMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** One request against the wire app. */
export interface WireScenario {
  /** Unique scenario name (fixture key). */
  name: string;
  /** HTTP method. */
  method: WireMethod;
  /** URL, already encoded. */
  url: string;
  /** JSON body (sent with `content-type: application/json`). */
  payload?: unknown;
  /** Scheduler behaviour for this request. */
  state?: Partial<WireState>;
  /** Extra rows or changes before the request. */
  setup?: (db: DatabaseSync) => void;
}

/**
 * Build a scenario.
 *
 * @param name - Fixture key.
 * @param method - HTTP method.
 * @param url - Encoded URL.
 * @param extra - Payload, state or setup.
 * @returns The scenario.
 */
export const scenario = (
  name: string,
  method: WireMethod,
  url: string,
  extra: Partial<WireScenario> = {},
): WireScenario => ({ name, method, url, ...extra });

/**
 * Build a GET scenario.
 *
 * @param name - Fixture key.
 * @param url - Encoded URL.
 * @param extra - State or setup.
 * @returns The scenario.
 */
export const get = (
  name: string,
  url: string,
  extra?: Partial<WireScenario>,
): WireScenario => scenario(name, 'GET', url, extra);

/**
 * Builder for scenarios that send a JSON body.
 *
 * @param method - HTTP method.
 * @returns `(name, url, payload, extra?) => scenario`.
 */
const withBody =
  (method: WireMethod) =>
  (
    name: string,
    url: string,
    payload: unknown,
    extra?: Partial<WireScenario>,
  ): WireScenario =>
    scenario(name, method, url, { payload, ...extra });

/** POST with a JSON body. */
export const post = withBody('POST');
/** PATCH with a JSON body. */
export const patch = withBody('PATCH');
/** PUT with a JSON body. */
export const put = withBody('PUT');
