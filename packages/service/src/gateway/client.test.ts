/**
 * Tests for the Gateway client against responses captured from a live
 * gateway (see `fixtures/README.md`). The mock gateway replays a fixture per
 * tool; tests that need a variant derive it from a fixture so the
 * surrounding structure stays real.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FixtureSessionRow, MockGateway } from '../test-utils/gateway.js';
import {
  gatewayFixture,
  gatewaySessionRows,
  startMockGateway,
} from '../test-utils/gateway.js';
import { createGatewayClient, type GatewayClient } from './client.js';

describe('Gateway client', () => {
  let gateway: MockGateway;
  let client: GatewayClient;

  beforeAll(async () => {
    gateway = await startMockGateway();
    client = createGatewayClient({
      url: gateway.url,
      token: 'test-token',
      timeoutMs: 2000,
    });
  });

  afterAll(() => gateway.close());

  beforeEach(() => {
    gateway.reset();
  });

  describe('spawnSession', () => {
    it('returns childSessionKey and runId from result.details', async () => {
      const { details } = gatewayFixture('sessions_spawn').result;

      const result = await client.spawnSession('Test task', {
        label: 'test-label',
        thinking: 'low',
        runTimeoutSeconds: 300,
      });

      expect(result).toEqual({
        sessionKey: details.childSessionKey,
        runId: details.runId,
      });
      expect(gateway.requests[0]).toMatchObject({
        headers: { authorization: 'Bearer test-token' },
        tool: 'sessions_spawn',
        args: {
          task: 'Test task',
          label: 'test-label',
          thinking: 'low',
          runTimeoutSeconds: 300,
        },
      });
    });

    it('throws naming the tool when details report an error', async () => {
      gateway.replies.sessions_spawn = {
        status: 200,
        body: gatewayFixture('sessions_history.not-found'),
      };

      await expect(client.spawnSession('x')).rejects.toThrow(
        /^Gateway sessions_spawn failed: No session found/,
      );
    });

    it('throws naming the tool and field when details lack the key', async () => {
      const body = gatewayFixture('sessions_spawn');
      delete body.result.details.childSessionKey;
      gateway.replies.sessions_spawn = { status: 200, body };

      await expect(client.spawnSession('x')).rejects.toThrow(
        /^Gateway sessions_spawn returned an unexpected response: result\.details\.childSessionKey/,
      );
    });

    it('rejects on a non-2xx gateway answer', async () => {
      gateway.replies.sessions_spawn = undefined;

      await expect(client.spawnSession('x')).rejects.toThrow(
        /HTTP 404: .*Tool not available: sessions_spawn/,
      );
    });

    it('rejects when the gateway is unreachable', async () => {
      const unreachable = createGatewayClient({
        url: 'http://127.0.0.1:1',
        token: 'test-token',
        timeoutMs: 1000,
      });

      await expect(unreachable.spawnSession('x')).rejects.toThrow();
    });
  });

  describe('getSessionHistory', () => {
    it('returns result.details.messages', async () => {
      const history = await client.getSessionHistory('any-key', 10);

      expect(
        history.map((m) => ({ role: m.role, stopReason: m.stopReason })),
      ).toEqual([
        { role: 'assistant', stopReason: 'toolUse' },
        { role: 'assistant', stopReason: 'stop' },
      ]);
      expect(gateway.requests[0]?.args).toEqual({
        sessionKey: 'any-key',
        limit: 10,
        includeTools: false,
      });
    });

    it('throws the gateway error for an unknown session', async () => {
      gateway.replies.sessions_history = {
        status: 200,
        body: gatewayFixture('sessions_history.not-found'),
      };

      await expect(client.getSessionHistory('gone')).rejects.toThrow(
        /^Gateway sessions_history failed: No session found: agent:main:subagent:/,
      );
    });

    it('throws on the array-shaped result the old client assumed', async () => {
      gateway.replies.sessions_history = {
        status: 200,
        body: { ok: true, result: [{ role: 'assistant', stopReason: 'stop' }] },
      };

      await expect(client.getSessionHistory('k')).rejects.toThrow(
        /^Gateway sessions_history returned an unexpected response: result:/,
      );
    });
  });

  describe('getSessionInfo', () => {
    it('finds the session by key in result.details.sessions (#125)', async () => {
      const { doneWithTokens } = gatewaySessionRows();

      const info = await client.getSessionInfo(doneWithTokens.key);

      expect(info).toEqual({
        totalTokens: doneWithTokens.totalTokens,
        model: doneWithTokens.model,
        status: 'done',
      });
      expect(gateway.requests[0]).toMatchObject({
        tool: 'sessions_list',
        args: { activeMinutes: 120, limit: 500 },
      });
    });

    it('leaves totalTokens undefined when the gateway omits it', async () => {
      const { doneNoTokens } = gatewaySessionRows();

      const info = await client.getSessionInfo(doneNoTokens.key);

      expect(info).not.toBeNull();
      expect(info?.totalTokens).toBeUndefined();
    });

    it('returns null for a session that is not listed', async () => {
      expect(
        await client.getSessionInfo('agent:main:subagent:none'),
      ).toBeNull();
    });

    it('throws naming the tool when a row lacks its key', async () => {
      const { list, rows } = gatewaySessionRows();
      rows.forEach((r) => {
        delete (r as Partial<FixtureSessionRow>).key;
      });
      gateway.replies.sessions_list = { status: 200, body: list };

      await expect(client.getSessionInfo('k')).rejects.toThrow(
        /^Gateway sessions_list returned an unexpected response: result\.details\.sessions\.0\.key/,
      );
    });

    it('throws on the array-shaped result the old client assumed', async () => {
      gateway.replies.sessions_list = {
        status: 200,
        body: { ok: true, result: [{ sessionKey: 'k', status: 'done' }] },
      };

      await expect(client.getSessionInfo('k')).rejects.toThrow(
        /^Gateway sessions_list returned an unexpected response: result:/,
      );
    });
  });

  describe('isSessionComplete', () => {
    it('is true for listed sessions that are done or timed out', async () => {
      const { doneWithTokens, timedOut } = gatewaySessionRows();

      expect(await client.isSessionComplete(doneWithTokens.key)).toBe(true);
      expect(await client.isSessionComplete(timedOut.key)).toBe(true);
      expect(gateway.requests.map((r) => r.tool)).toEqual([
        'sessions_list',
        'sessions_list',
      ]);
    });

    it('is false for a listed running session', async () => {
      const { running } = gatewaySessionRows();

      expect(await client.isSessionComplete(running.key)).toBe(false);
      expect(gateway.requests.map((r) => r.tool)).toEqual(['sessions_list']);
    });

    it.each(['failed', 'killed'])(
      'is true for a listed session with status %s',
      async (status) => {
        const { list, running } = gatewaySessionRows();
        running.status = status;
        gateway.replies.sessions_list = { status: 200, body: list };

        expect(await client.isSessionComplete(running.key)).toBe(true);
      },
    );

    it('is false for a listed session with status queued', async () => {
      const { list, running } = gatewaySessionRows();
      running.status = 'queued';
      gateway.replies.sessions_list = { status: 200, body: list };

      expect(await client.isSessionComplete(running.key)).toBe(false);
    });

    it('falls back to history when not listed: last assistant turn stopped', async () => {
      expect(await client.isSessionComplete('agent:main:subagent:aged')).toBe(
        true,
      );
      expect(gateway.requests.map((r) => r.tool)).toEqual([
        'sessions_list',
        'sessions_history',
      ]);
    });

    it('falls back to history: an aborted last turn is complete', async () => {
      gateway.replies.sessions_history = {
        status: 200,
        body: gatewayFixture('sessions_history.aborted'),
      };

      expect(await client.isSessionComplete('agent:main:subagent:aged')).toBe(
        true,
      );
    });

    it('falls back to history: a turn waiting on a tool is not complete', async () => {
      const body = gatewayFixture('sessions_history.done');
      const messages = body.result.details.messages as unknown[];
      body.result.details.messages = messages.slice(0, 1); // stopReason toolUse
      gateway.replies.sessions_history = { status: 200, body };

      expect(await client.isSessionComplete('agent:main:subagent:aged')).toBe(
        false,
      );
    });

    it('falls back to history: no messages yet is not complete', async () => {
      const body = gatewayFixture('sessions_history.done');
      body.result.details.messages = [];
      gateway.replies.sessions_history = { status: 200, body };

      expect(await client.isSessionComplete('agent:main:subagent:aged')).toBe(
        false,
      );
    });
  });
});
