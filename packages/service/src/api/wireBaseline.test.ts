/**
 * @module api/wireBaseline.test
 * Wire freeze (DD#87, DD#96): every scenario in `test/wire/scenarios` is replayed through the real server and must match, byte for byte, the reviewed 0.14.0-1 expectations (`test/wire/wire-0.14.0-1.json`). Every scenario whose 0.14.0-1 reply differs from what 0.14.0-0 sent (`test/wire/wire-0.14.0-0.json`) must be an approved departure (`test/wire/departures`) and meet its DD#87 item's invariant.
 */

import { readFileSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';

import { RUNNER_ERROR_STATUS } from '@karmaniverous/jeeves-runner-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  WIRE_DEPARTURES,
  type WireDeparture,
} from '../test/wire/departures.js';
import { WIRE_SCENARIOS } from '../test/wire/scenarios.js';
import { startWireApp, type WireApp } from '../test/wire/wireApp.js';
import { runScenario } from '../test/wire/wireRun.js';
import type { WireRecord } from '../test/wire/wireTypes.js';

/**
 * A recorded wire file.
 *
 * @param name - File name in `test/wire`.
 * @returns Records by scenario name.
 */
const records = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../test/wire/${name}`, import.meta.url), 'utf8'),
  ) as Record<string, WireRecord>;

/** What 0.14.0-0 sent. */
const before = records('wire-0.14.0-0.json');
/** What 0.14.0-1 sends (reviewed; DD#87 departures applied). */
const after = records('wire-0.14.0-1.json');

const names = WIRE_SCENARIOS.map((s) => s.name).sort();
const changed = names.filter(
  (name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]),
);

/** A parsed error body. */
type Body = Record<string, unknown>;

/**
 * Assert a record is Fastify's standard error body with this status and
 * code: exactly `statusCode`, `code`, `error`, `message`, in that order.
 *
 * @param record - The 0.14.0-1 record.
 * @param status - Expected status.
 * @param code - Expected code.
 * @returns The parsed body.
 */
function expectStandardBody(
  record: WireRecord,
  status: number,
  code: string | undefined,
): Body {
  expect(record.status).toBe(status);
  expect(record.contentType).toBe('application/json; charset=utf-8');
  const body = JSON.parse(record.body) as Body;
  expect(Object.keys(body)).toEqual(['statusCode', 'code', 'error', 'message']);
  expect(body).toMatchObject({
    statusCode: status,
    code,
    error: STATUS_CODES[status],
  });
  expect(typeof body.message).toBe('string');
  return body;
}

/** Each DD#87 item's invariant over the old and new record. */
const INVARIANTS: Readonly<
  Record<
    WireDeparture['item'],
    (old: WireRecord, now: WireRecord, d: WireDeparture) => void
  >
> = {
  a: (_old, now, d) => {
    const body = expectStandardBody(now, 400, 'FST_ERR_VALIDATION');
    expect(body.message).toMatch(new RegExp(`^${d.field ?? ''}`));
  },
  'a-reread': (old, now) => {
    expect([old.status, now.status]).toEqual([200, 200]);
  },
  d: (old, now, d) => {
    expectStandardBody(now, old.status, d.code);
  },
  e: (old, now, d) => {
    expect(old.status).toBe(500);
    expectStandardBody(now, 409, d.code);
  },
  f: (old, now, d) => {
    expect(old.status).toBe(500);
    expectStandardBody(now, 500, d.code);
  },
  g: (old, now, d) => {
    expect(old.status).toBe(500);
    expectStandardBody(now, 400, d.code);
  },
};

let wire: WireApp;

beforeAll(async () => {
  wire = await startWireApp();
});

afterAll(async () => {
  await wire.close();
});

describe('routes send the 0.14.0-1 wire', () => {
  it('has both records for every scenario and no stale ones', () => {
    expect(Object.keys(before).sort()).toEqual(names);
    expect(Object.keys(after).sort()).toEqual(names);
  });

  it.each(WIRE_SCENARIOS.map((s) => [s.name, s] as const))(
    '%s',
    async (name, scenario) => {
      expect(await runScenario(wire, scenario)).toEqual(after[name]);
    },
  );
});

describe('every change from 0.14.0-0 is an approved departure (DD#87)', () => {
  it('lists exactly the scenarios that changed', () => {
    expect(changed).toEqual(Object.keys(WIRE_DEPARTURES).sort());
  });

  it.each(changed.map((name) => [name, WIRE_DEPARTURES[name]] as const))(
    '%s meets its item',
    (name, departure) => {
      expect(departure).toBeDefined();
      const d = departure as WireDeparture;
      INVARIANTS[d.item](before[name], after[name], d);
    },
  );

  it("sends each runner code with core's status", () => {
    const runnerCodes = Object.entries(WIRE_DEPARTURES).flatMap(([name, d]) =>
      d?.code !== undefined && d.code in RUNNER_ERROR_STATUS
        ? [[name, d.code as keyof typeof RUNNER_ERROR_STATUS] as const]
        : [],
    );
    expect(new Set(runnerCodes.map(([, code]) => code)).size).toBe(
      Object.keys(RUNNER_ERROR_STATUS).length,
    );
    for (const [name, code] of runnerCodes)
      expect(after[name].status).toBe(RUNNER_ERROR_STATUS[code]);
  });
});
