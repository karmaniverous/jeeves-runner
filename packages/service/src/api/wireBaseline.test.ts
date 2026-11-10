/**
 * @module api/wireBaseline.test
 * Wire freeze (DD#87): every scenario in `test/wire/scenarios` is replayed through the real server and must match, byte for byte, what 0.14.0-0 sent (`test/wire/wire-0.14.0-0.json`), except the approved departures in `test/wire/departures` (requests that fail a catalog schema now get jeeves' uniform 400; two `limit` spellings `parseInt` misread are now read as numbers).
 */

import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WIRE_DEPARTURES } from '../test/wire/departures.js';
import { WIRE_SCENARIOS } from '../test/wire/scenarios.js';
import { startWireApp, type WireApp } from '../test/wire/wireApp.js';
import { runScenario } from '../test/wire/wireRun.js';
import type { WireRecord } from '../test/wire/wireTypes.js';

const baseline = JSON.parse(
  readFileSync(
    new URL('../test/wire/wire-0.14.0-0.json', import.meta.url),
    'utf8',
  ),
) as Record<string, WireRecord>;

const unchanged = WIRE_SCENARIOS.filter((s) => !(s.name in WIRE_DEPARTURES));
const departing = WIRE_SCENARIOS.flatMap((s) => {
  const departure = WIRE_DEPARTURES[s.name];
  return departure ? [[s.name, s, departure] as const] : [];
});

let wire: WireApp;

beforeAll(async () => {
  wire = await startWireApp();
});

afterAll(async () => {
  await wire.close();
});

describe('routes keep the 0.14.0-0 wire format', () => {
  it('has a baseline for every scenario and no stale ones', () => {
    expect(Object.keys(baseline).sort()).toEqual(
      WIRE_SCENARIOS.map((s) => s.name).sort(),
    );
  });

  it('lists departures only for known scenarios', () => {
    expect(departing.map(([name]) => name).sort()).toEqual(
      Object.keys(WIRE_DEPARTURES).sort(),
    );
  });

  it.each(unchanged.map((s) => [s.name, s] as const))(
    '%s: unchanged',
    async (name, scenario) => {
      expect(await runScenario(wire, scenario)).toEqual(baseline[name]);
    },
  );
});

describe('approved departures (DD#87 item a)', () => {
  const rereads = departing.filter(([, , d]) => !d.issue);
  const refusals = departing.flatMap(([name, scenario, d]) =>
    d.issue ? [[name, scenario, d.issue] as const] : [],
  );

  it.each(rereads)(
    '%s: limit read by number coercion, still 200',
    async (name, scenario) => {
      const received = await runScenario(wire, scenario);
      expect(received).not.toEqual(baseline[name]);
      expect(received.status).toBe(200);
      expect(baseline[name].status).toBe(200);
    },
  );

  it.each(refusals)(
    '%s: uniform request-validation 400',
    async (name, scenario, issue) => {
      const received = await runScenario(wire, scenario);
      // Still a change, or the departure is stale and must be removed.
      expect(received).not.toEqual(baseline[name]);
      expect(received.status).toBe(400);
      expect(received.contentType).toBe('application/json; charset=utf-8');
      const body = JSON.parse(received.body) as {
        error: string;
        issues: { slot: string; path: string[] }[];
      };
      expect(Object.keys(body)).toEqual(['error', 'issues']);
      expect(body.error).toBe('Request validation failed');
      expect(body.issues[0]).toMatchObject(issue);
    },
  );
});
