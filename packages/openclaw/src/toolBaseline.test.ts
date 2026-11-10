/**
 * Plugin baseline (DD#91, spec 4B.5 B7): the 16 runner tools keep the 0.12.0-0 names, descriptions and parameters, and every call sends the same requests and returns the same result text, errors included (`test/tools-0.12.0-0.json`, recorded against the 0.12.0-0 tools).
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
      expect(await runToolScenario(scenario)).toEqual(baseline.records[name]);
    },
  );
});
