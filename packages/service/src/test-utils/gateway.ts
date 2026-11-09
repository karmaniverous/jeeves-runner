/**
 * Mock OpenClaw Gateway for tests: serves `/tools/invoke` replies per tool,
 * by default the responses captured from a live gateway in
 * `src/gateway/fixtures/`.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A `/tools/invoke` envelope as read from a fixture. */
export interface FixtureEnvelope {
  ok: boolean;
  result: { content: unknown[]; details: Record<string, unknown> };
}

/** One session row of the `sessions_list` fixture. */
export interface FixtureSessionRow {
  key: string;
  status?: string;
  totalTokens?: number;
  model?: string;
}

/** Read a captured gateway fixture (e.g. `sessions_list`) as a fresh object. */
export function gatewayFixture(name: string): FixtureEnvelope {
  return JSON.parse(
    readFileSync(
      new URL(`../gateway/fixtures/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as FixtureEnvelope;
}

/** The `sessions_list` fixture and its rows by role. */
export function gatewaySessionRows() {
  const list = gatewayFixture('sessions_list');
  const rows = list.result.details.sessions as FixtureSessionRow[];
  const subagents = rows.filter((r) => r.key.includes(':subagent:'));
  const find = (pred: (r: FixtureSessionRow) => boolean) => {
    const row = subagents.find(pred) ?? rows.find(pred);
    if (!row) throw new Error('sessions_list fixture lacks an expected row');
    return row;
  };
  return {
    list,
    rows,
    running: find((r) => r.status === 'running'),
    doneWithTokens: find(
      (r) => r.status === 'done' && r.totalTokens !== undefined,
    ),
    doneNoTokens: find(
      (r) => r.status === 'done' && r.totalTokens === undefined,
    ),
    timedOut: find((r) => r.status === 'timeout'),
  };
}

/** A reply the mock serves for one tool. */
export interface MockReply {
  status: number;
  body: unknown;
}

/** A request the mock received. */
export interface MockRequest {
  headers: Record<string, unknown>;
  tool: string;
  args: Record<string, unknown>;
}

/** Running mock gateway. */
export interface MockGateway {
  url: string;
  /** Replies by tool name; a tool without one gets the real 404 body. */
  replies: Record<string, MockReply | undefined>;
  requests: MockRequest[];
  /** Restore the default fixture replies and clear the request log. */
  reset: () => void;
  close: () => Promise<void>;
}

function defaultReplies(): Record<string, MockReply> {
  return {
    sessions_spawn: { status: 200, body: gatewayFixture('sessions_spawn') },
    sessions_list: { status: 200, body: gatewayFixture('sessions_list') },
    sessions_history: {
      status: 200,
      body: gatewayFixture('sessions_history.done'),
    },
  };
}

/** Start a mock gateway on a random local port. */
export async function startMockGateway(): Promise<MockGateway> {
  const state: Pick<MockGateway, 'replies' | 'requests'> = {
    replies: defaultReplies(),
    requests: [],
  };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const parsed = JSON.parse(body) as {
        tool: string;
        args: Record<string, unknown>;
      };
      state.requests.push({ headers: req.headers, ...parsed });
      const reply = state.replies[parsed.tool];
      // Without a reply: the real gateway's answer for an unexposed tool.
      const { status, body: out } = reply ?? {
        status: 404,
        body: {
          ok: false,
          error: {
            type: 'not_found',
            message: `Tool not available: ${parsed.tool}`,
          },
        },
      };
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    get replies() {
      return state.replies;
    },
    get requests() {
      return state.requests;
    },
    reset: () => {
      state.replies = defaultReplies();
      state.requests = [];
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
