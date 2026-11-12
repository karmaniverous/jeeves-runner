/**
 * @module test/wire/wireRun
 * Runs a wire scenario against a {@link WireApp} from a reset state and records what a client sees: status, content type and the body text, with volatile values (uptime, versions, queue ages, temp paths) normalised. No assertions.
 */

import type { LightMyRequestResponse } from 'fastify';

import type { WireApp } from './wireApp.js';
import type { WireRecord, WireScenario } from './wireTypes.js';

/**
 * Replace values that change between runs or releases: `/status` uptime and
 * version, a pending queue item's age (wall-clock dependent) and the temp
 * directory.
 *
 * @param text - Body text.
 * @param wire - The wire app.
 * @returns The normalised text.
 */
export function normaliseBody(text: string, wire: WireApp): string {
  const forms = [wire.dir, JSON.stringify(wire.dir).slice(1, -1)];
  let out = text;
  for (const form of forms) out = out.split(form).join('{dir}');
  return out
    .replace(/"uptime":\d+(\.\d+)?/g, '"uptime":0')
    .replace(/("name":"runner","version":)"[^"]*"/g, '$1"{version}"')
    .replace(/"oldestAge":[1-9]\d*/g, '"oldestAge":"{age}"');
}

/**
 * Run one scenario from a reset state and return the raw reply.
 *
 * @param wire - The wire app.
 * @param scenario - The scenario.
 * @returns The Fastify inject response.
 */
export async function injectScenario(
  wire: WireApp,
  scenario: WireScenario,
): Promise<LightMyRequestResponse> {
  wire.reset();
  Object.assign(wire.state, scenario.state);
  scenario.setup?.(wire.db);
  return wire.app.inject({
    method: scenario.method,
    url: scenario.url,
    ...(scenario.payload === undefined
      ? {}
      : { payload: scenario.payload as object }),
  });
}

/**
 * Run one scenario and record the reply.
 *
 * @param wire - The wire app.
 * @param scenario - The scenario.
 * @returns The record.
 */
export async function runScenario(
  wire: WireApp,
  scenario: WireScenario,
): Promise<WireRecord> {
  const res = await injectScenario(wire, scenario);
  const contentType = res.headers['content-type'];
  return {
    status: res.statusCode,
    ...(contentType === undefined ? {} : { contentType }),
    body: normaliseBody(res.body, wire),
  };
}
