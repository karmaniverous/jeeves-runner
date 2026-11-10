/**
 * @module test/toolScenarios
 * Plugin baseline harness (spec 4B.5 B7): scenario and record shapes, the mock plugin API, and a runner that records what each tool call sent and returned. The calls themselves are in `toolScenarioData`. Shared by the recorder and the baseline test; no assertions.
 */

import type { PluginApi, ToolResult } from '@karmaniverous/jeeves';
import { vi } from 'vitest';

import { registerRunnerCustomTools } from '../runnerTools.js';

export { TOOL_SCENARIOS } from './toolScenarioData.js';

/** Base URL the tools are registered with. */
export const BASE_URL = 'http://localhost:1937';

/** What a stub fetch does. */
export type StubReply =
  { status: number; body: string } | { reject: 'refused' | 'timeout' };

/** One tool call. */
export interface ToolScenario {
  /** Fixture key. */
  name: string;
  /** Tool name. */
  tool: string;
  /** Tool parameters. */
  params: Record<string, unknown>;
  /** Stub reply. */
  reply: StubReply;
}

/** What one call sent and returned. */
export interface ToolRecord {
  /** Requests sent (URL, method, JSON body). */
  requests: { url: string; method: string; body?: unknown }[];
  /** The tool result. */
  result: ToolResult;
}

/** A registered tool's definition. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
}

/** Mock plugin API that keeps registered tools. */
export function createToolApi() {
  const tools = new Map<
    string,
    ToolDefinition & {
      execute: (
        id: string,
        params: Record<string, unknown>,
      ) => Promise<ToolResult>;
    }
  >();
  const api: PluginApi = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  };
  registerRunnerCustomTools(api, BASE_URL);
  return tools;
}

/**
 * Definitions of the registered tools, in registration order.
 *
 * @returns Name, description and parameters of each tool.
 */
export function toolDefinitions(): ToolDefinition[] {
  return [...createToolApi().values()].map(
    ({ name, description, parameters }) => ({ name, description, parameters }),
  );
}

/**
 * Stub `fetch` for one reply, recording requests.
 *
 * @param reply - What to answer.
 * @param requests - Where to record requests.
 */
function stubFetch(reply: StubReply, requests: ToolRecord['requests']): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    requests.push({
      url,
      method: init?.method ?? 'GET',
      ...(body === undefined ? {} : { body }),
    });
    if ('reject' in reply) {
      return Promise.reject(
        reply.reject === 'refused'
          ? new TypeError('fetch failed', {
              cause: Object.assign(new Error('connect ECONNREFUSED'), {
                code: 'ECONNREFUSED',
              }),
            })
          : new DOMException(
              'The operation was aborted due to timeout',
              'TimeoutError',
            ),
      );
    }
    return Promise.resolve(
      new Response(reply.body, {
        status: reply.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );
  });
}

/**
 * Run one scenario and record what was sent and returned.
 *
 * @param scenario - The scenario.
 * @returns The record.
 */
export async function runToolScenario(
  scenario: ToolScenario,
): Promise<ToolRecord> {
  const tool = createToolApi().get(scenario.tool);
  if (!tool) throw new Error(`No tool ${scenario.tool}`);
  const requests: ToolRecord['requests'] = [];
  stubFetch(scenario.reply, requests);
  try {
    const result = await tool.execute('call', scenario.params);
    return { requests, result };
  } finally {
    vi.restoreAllMocks();
  }
}
