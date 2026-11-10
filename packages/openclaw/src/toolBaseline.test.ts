/**
 * Plugin baseline (DD#91, spec 4B.5 B7): the 16 runner tools keep the 0.12.0-0 names, descriptions and parameters, and every call sends the same requests and returns the same result text, errors included (`test/tools-0.12.0-0.json`, recorded against the 0.12.0-0 tools).
 *
 * One request delta: `runner_trigger`, `runner_enable` and `runner_disable`
 * sent an empty JSON body `{}`; the SDK sends none, as their catalog entries
 * declare no body. The routes ignore any body (the service's wire scenarios
 * `triggerJob no body` and `enableJob no body` get the same replies).
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  runToolScenario,
  TOOL_SCENARIOS,
  type ToolDefinition,
  toolDefinitions,
  type ToolRecord,
} from './test/toolScenarios.js';

const baseline = JSON.parse(
  readFileSync(new URL('./test/tools-0.12.0-0.json', import.meta.url), 'utf8'),
) as {
  definitions: ToolDefinition[];
  records: Record<string, ToolRecord>;
};

/** Tools whose 0.12.0-0 requests carried an empty body the SDK omits. */
const EMPTY_BODY_TOOLS = new Set([
  'runner_trigger',
  'runner_enable',
  'runner_disable',
]);

/**
 * The 0.12.0-0 record, less the empty body the SDK no longer sends.
 *
 * @param tool - Tool name.
 * @param record - Recorded call.
 * @returns The expected record.
 */
function expected(tool: string, record: ToolRecord | undefined): ToolRecord {
  if (!record) throw new Error('missing baseline record');
  if (!EMPTY_BODY_TOOLS.has(tool)) return record;
  return {
    ...record,
    requests: record.requests.map(({ url, method, body }) => {
      expect(body).toEqual({});
      return { url, method };
    }),
  };
}

describe('runner tools keep the 0.12.0-0 surface', () => {
  it('registers the same 16 tools with the same descriptions and parameters', () => {
    expect(toolDefinitions()).toEqual(baseline.definitions);
  });

  it('has a baseline for every scenario and no stale ones', () => {
    expect(Object.keys(baseline.records).sort()).toEqual(
      TOOL_SCENARIOS.map((s) => s.name).sort(),
    );
  });

  it.each(TOOL_SCENARIOS.map((s) => [s.name, s] as const))(
    '%s: same requests and result',
    async (name, scenario) => {
      expect(await runToolScenario(scenario)).toEqual(
        expected(scenario.tool, baseline.records[name]),
      );
    },
  );
});
