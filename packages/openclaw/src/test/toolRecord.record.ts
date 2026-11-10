/**
 * @module test/toolRecord
 * Records the plugin baseline (tool definitions and every tool scenario's requests and result) to the JSON file named by `TOOL_RECORD`. Not part of the test suite (`.record.ts` is outside vitest's include); run with `npx vitest run --config vitest.tool-record.config.ts`. It recorded `tools-0.12.0-0.json` against the 0.12.0-0 tools. Writes one file.
 */

import { writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import {
  runToolScenario,
  TOOL_SCENARIOS,
  toolDefinitions,
  type ToolRecord,
} from './toolScenarios.js';

it('records the tool baseline', async () => {
  const out = process.env.TOOL_RECORD;
  expect(out, 'set TOOL_RECORD to the output path').toBeTruthy();
  const records: Record<string, ToolRecord> = {};
  for (const scenario of TOOL_SCENARIOS) {
    records[scenario.name] = await runToolScenario(scenario);
  }
  writeFileSync(
    out as string,
    JSON.stringify({ definitions: toolDefinitions(), records }, null, 2) + '\n',
  );
});
