/**
 * Every captured gateway response parses with the schemas the client uses
 * (DD#84). If OpenClaw changes a shape, recapture the fixture and this
 * test shows which schema no longer matches.
 */

import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  sessionsHistoryDetailsSchema,
  sessionsListDetailsSchema,
  spawnDetailsSchema,
  toolErrorDetailsSchema,
  toolResponseEnvelopeSchema,
} from './schemas.js';

const dir = new URL('./fixtures/', import.meta.url);

function details(name: string): unknown {
  const parsed = toolResponseEnvelopeSchema.parse(
    JSON.parse(readFileSync(new URL(name, dir), 'utf8')),
  );
  return parsed.result.details;
}

describe('gateway response schemas', () => {
  const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('has a fixture for every tool the client calls, plus session_status', () => {
    expect(fixtures.sort()).toEqual([
      'session_status.json',
      'sessions_history.aborted.json',
      'sessions_history.done.json',
      'sessions_history.not-found.json',
      'sessions_list.json',
      'sessions_spawn.json',
    ]);
  });

  it.each(fixtures)('%s uses the shared /tools/invoke envelope', (name) => {
    expect(() => details(name)).not.toThrow();
  });

  it.each<[string, z.ZodType]>([
    ['sessions_spawn.json', spawnDetailsSchema],
    ['sessions_list.json', sessionsListDetailsSchema],
    ['sessions_history.done.json', sessionsHistoryDetailsSchema],
    ['sessions_history.aborted.json', sessionsHistoryDetailsSchema],
    ['sessions_history.not-found.json', toolErrorDetailsSchema],
  ])('%s details match their schema', (name, schema) => {
    expect(schema.safeParse(details(name)).success).toBe(true);
  });

  it('does not mistake a successful result for a tool error', () => {
    for (const name of [
      'sessions_spawn.json',
      'sessions_list.json',
      'sessions_history.done.json',
      'session_status.json',
    ]) {
      expect(toolErrorDetailsSchema.safeParse(details(name)).success).toBe(
        false,
      );
    }
  });
});
