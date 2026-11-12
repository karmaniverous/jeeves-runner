/**
 * Plugin baseline (DD#91, spec 4B.5 B7): the 16 runner tools keep the 0.12.0-0 names, descriptions, parameter names and required parameters, and every call sends the same requests and returns the same result text, errors included (`test/tools-0.12.0-0.json`, recorded against the 0.12.0-0 tools).
 *
 * Parameter schemas now come from the catalog (`catalogToolDefinition`), so
 * they are stricter than the hand-written 0.12.0-0 ones (types, enums,
 * `additionalProperties: false`, ...), and `runner_query_collection` gains
 * the entry's `limit`, `order` and `path`: the approved deltas in
 * {@link ADDED_PARAMETERS} and the PR.
 *
 * One request delta: `runner_trigger`, `runner_enable` and `runner_disable`
 * sent an empty JSON body `{}`; the SDK sends none, as their catalog entries
 * declare no body. The routes ignore any body (the service's wire scenarios
 * `triggerJob no body` and `enableJob no body` get the same replies).
 *
 * Error-text deltas (DD#96, #136): the runner's error bodies are now
 * Fastify's standard body with a `RUNNER_*` code, so the scenarios in
 * {@link ERROR_BODY_DELTAS} reply with the 0.14.0-1 body. The wording is
 * unchanged, `Error: HTTP <status>: <body as received>` (the watcher's
 * catalog-tool text), so the text now carries the code and message; the
 * status in it is the same as in 0.12.0-0.
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

/**
 * Scenarios whose stub now replies with the 0.14.0-1 error body (DD#96):
 * the code each body carries.
 */
const ERROR_BODY_DELTAS: Readonly<Record<string, string>> = {
  'trigger 404': 'RUNNER_JOB_NOT_FOUND',
  'trigger 409': 'RUNNER_MAX_CONCURRENCY',
  'trigger 500 Fastify default body': 'RUNNER_TRIGGER_FAILED',
  'job detail 404': 'RUNNER_JOB_NOT_FOUND',
  'create job bad schedule': 'RUNNER_INVALID_SCHEDULE',
};

/** The text of a tool error result. */
const textOf = (record: ToolRecord): string =>
  record.result.content[0]?.text ?? '';

/** The `HTTP <status>: ` prefix of a tool error text. */
const statusPrefix = (text: string): string =>
  /^Error: HTTP \d+: /.exec(text)?.[0] ?? '';

/**
 * The expected record of a delta scenario: the 0.12.0-0 record (requests
 * included) with the result text naming the stub's 0.14.0-1 body.
 *
 * @param name - Scenario name.
 * @param record - The 0.12.0-0 record.
 * @param body - The stub's reply body.
 * @returns The expected record.
 */
function withNewBody(
  name: string,
  record: ToolRecord,
  body: string,
): ToolRecord {
  const prefix = statusPrefix(textOf(record));
  if (prefix === '') throw new Error(`${name}: not an HTTP error text`);
  const text = `${prefix}${body}`;
  return {
    ...record,
    result: { ...record.result, content: [{ type: 'text', text }] },
  };
}

/** Parameters a tool gains from its catalog entry (approved in the PR). */
const ADDED_PARAMETERS: Readonly<Record<string, readonly string[]>> = {
  runner_query_collection: ['limit', 'order', 'path'],
};

interface ParameterSchema {
  properties: Record<string, unknown>;
  required?: string[];
}

describe('runner tools keep the 0.12.0-0 surface', () => {
  const current = toolDefinitions();

  it('registers the same 16 tools, in order, with the same descriptions', () => {
    expect(
      current.map(({ name, description }) => ({ name, description })),
    ).toEqual(
      baseline.definitions.map(({ name, description }) => ({
        name,
        description,
      })),
    );
  });

  it.each(baseline.definitions.map((d) => [d.name, d] as const))(
    '%s keeps its parameter names and required parameters',
    (name, before) => {
      const now = current.find((d) => d.name === name);
      const was = before.parameters as ParameterSchema;
      const is = now?.parameters as ParameterSchema;
      expect(Object.keys(is.properties).sort()).toEqual(
        [
          ...Object.keys(was.properties),
          ...(ADDED_PARAMETERS[name] ?? []),
        ].sort(),
      );
      expect([...(is.required ?? [])].sort()).toEqual(
        [...(was.required ?? [])].sort(),
      );
    },
  );

  it('has a baseline for every scenario and no stale ones', () => {
    expect(Object.keys(baseline.records).sort()).toEqual(
      TOOL_SCENARIOS.map((s) => s.name).sort(),
    );
  });

  it.each(
    TOOL_SCENARIOS.filter((s) => !(s.name in ERROR_BODY_DELTAS)).map(
      (s) => [s.name, s] as const,
    ),
  )('%s: same requests and result', async (name, scenario) => {
    expect(await runToolScenario(scenario)).toEqual(
      expected(scenario.tool, baseline.records[name]),
    );
  });
});

describe('error texts carry the 0.14.0-1 body (DD#96)', () => {
  const deltas = TOOL_SCENARIOS.filter((s) => s.name in ERROR_BODY_DELTAS);

  it('lists only known scenarios', () => {
    expect(deltas.map((s) => s.name).sort()).toEqual(
      Object.keys(ERROR_BODY_DELTAS).sort(),
    );
  });

  it.each(deltas.map((s) => [s.name, s] as const))(
    '%s: same requests and status, the standard body with its code',
    async (name, scenario) => {
      const reply = scenario.reply as { status: number; body: string };
      const body = JSON.parse(reply.body) as Record<string, unknown>;
      expect(Object.keys(body)).toEqual([
        'statusCode',
        'code',
        'error',
        'message',
      ]);
      expect(body).toMatchObject({
        statusCode: reply.status,
        code: ERROR_BODY_DELTAS[name],
      });
      const record = expected(scenario.tool, baseline.records[name]);
      const now = await runToolScenario(scenario);
      expect(now).toEqual(withNewBody(name, record, reply.body));
      expect(textOf(now)).not.toBe(textOf(record));
    },
  );
});
