/**
 * OpenClaw Gateway HTTP client for spawning and monitoring sessions.
 *
 * @module
 */

import { fetchJson } from '@karmaniverous/jeeves';
import type { z } from 'zod';

import {
  sessionsHistoryDetailsSchema,
  sessionsListDetailsSchema,
  spawnDetailsSchema,
  toolErrorDetailsSchema,
  toolResponseEnvelopeSchema,
} from './schemas.js';

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30000;

/** Options for creating a Gateway client. */
export interface GatewayClientOptions {
  /** Gateway base URL (e.g., http://127.0.0.1:18789). */
  url: string;
  /** Bearer token for authentication. */
  token: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Options for spawning a session. */
export interface SpawnSessionOptions {
  /** Optional session label. */
  label?: string;
  /** Thinking level: low, medium, or high. */
  thinking?: 'low' | 'medium' | 'high';
  /** Run timeout in seconds. */
  runTimeoutSeconds?: number;
}

/** Result of spawning a session. */
export interface SpawnSessionResult {
  /** Session key for tracking. */
  sessionKey: string;
  /** Run identifier. */
  runId: string;
}

/** Session history message. */
export interface SessionMessage {
  /** Message role (user, assistant, etc.). */
  role: string;
  /** Stop reason (if present, indicates completion). */
  stopReason?: string;
}

/** Session information from sessions_list. */
export interface SessionInfo {
  /** Total tokens used; absent when the gateway has not reported usage. */
  totalTokens?: number;
  /** Model name, if reported. */
  model?: string;
  /** Run status from sessions_list (`queued`, `running`, `done`, `failed`, `killed`, `timeout`). */
  status?: string;
}

/** sessions_list statuses after which a session will not run again. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'done',
  'failed',
  'killed',
  'timeout',
]);

/** Gateway client for invoking tools via /tools/invoke. */
export interface GatewayClient {
  /** Spawn a new session with the given task. */
  spawnSession(
    task: string,
    options?: SpawnSessionOptions,
  ): Promise<SpawnSessionResult>;
  /** Get session history messages. */
  getSessionHistory(
    sessionKey: string,
    limit?: number,
  ): Promise<SessionMessage[]>;
  /** Get session info (tokens, model, etc.). Returns null if not found. */
  getSessionInfo(sessionKey: string): Promise<SessionInfo | null>;
  /** Check if session is complete. */
  isSessionComplete(sessionKey: string): Promise<boolean>;
}

/**
 * Validate a `/tools/invoke` response against a tool's details schema.
 * A tool-level error (`details.status === 'error'`) and a shape mismatch
 * both throw an error naming the tool.
 */
function parseToolResponse<T extends z.ZodType>(
  tool: string,
  response: unknown,
  detailsSchema: T,
): z.output<T> {
  const unexpected = (error: z.ZodError, prefix: string[]) =>
    new Error(
      `Gateway ${tool} returned an unexpected response: ${error.issues
        .map(
          (i) =>
            `${[...prefix, ...i.path.map(String)].join('.')}: ${i.message}`,
        )
        .join('; ')}`,
    );

  const envelope = toolResponseEnvelopeSchema.safeParse(response);
  if (!envelope.success) throw unexpected(envelope.error, []);
  const { details } = envelope.data.result;

  const toolError = toolErrorDetailsSchema.safeParse(details);
  if (toolError.success) {
    throw new Error(`Gateway ${tool} failed: ${toolError.data.error}`);
  }

  const parsed = detailsSchema.safeParse(details);
  if (!parsed.success) throw unexpected(parsed.error, ['result', 'details']);
  return parsed.data;
}

/** Make an HTTP POST request to the Gateway /tools/invoke endpoint. */
function invokeGateway(
  url: string,
  token: string,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  return fetchJson(`${url}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tool, args }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Create a Gateway client. */
export function createGatewayClient(
  options: GatewayClientOptions,
): GatewayClient {
  const { url, token, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  return {
    async spawnSession(
      task: string,
      opts?: SpawnSessionOptions,
    ): Promise<SpawnSessionResult> {
      const details = parseToolResponse(
        'sessions_spawn',
        await invokeGateway(
          url,
          token,
          'sessions_spawn',
          {
            task,
            label: opts?.label,
            thinking: opts?.thinking,
            runTimeoutSeconds: opts?.runTimeoutSeconds,
          },
          timeoutMs,
        ),
        spawnDetailsSchema,
      );

      return { sessionKey: details.childSessionKey, runId: details.runId };
    },

    async getSessionHistory(
      sessionKey: string,
      limit = 3,
    ): Promise<SessionMessage[]> {
      const details = parseToolResponse(
        'sessions_history',
        await invokeGateway(
          url,
          token,
          'sessions_history',
          { sessionKey, limit, includeTools: false },
          timeoutMs,
        ),
        sessionsHistoryDetailsSchema,
      );

      return details.messages;
    },

    async getSessionInfo(sessionKey: string): Promise<SessionInfo | null> {
      // The gateway has no single-session lookup that reports usage, so list
      // recently active sessions and search client-side (O(n), n <= 500).
      const details = parseToolResponse(
        'sessions_list',
        await invokeGateway(
          url,
          token,
          'sessions_list',
          { activeMinutes: 120, limit: 500 },
          timeoutMs,
        ),
        sessionsListDetailsSchema,
      );

      const session = details.sessions.find((s) => s.key === sessionKey);
      if (!session) return null;

      return {
        totalTokens: session.totalTokens,
        model: session.model,
        status: session.status,
      };
    },

    async isSessionComplete(sessionKey: string): Promise<boolean> {
      // Primary: the session's run status in sessions_list.
      const info = await this.getSessionInfo(sessionKey);
      if (info) {
        return info.status !== undefined && TERMINAL_STATUSES.has(info.status);
      }

      // Fallback: not listed (aged out of the active window). Complete when
      // the last message is an assistant turn that ended for a reason other
      // than a tool call (with includeTools: false, a turn that is waiting on
      // a tool ends the history with stopReason 'toolUse').
      const history = await this.getSessionHistory(sessionKey, 3);
      const lastMessage = history.at(-1);
      if (!lastMessage) return false;

      return (
        lastMessage.role === 'assistant' &&
        lastMessage.stopReason !== undefined &&
        lastMessage.stopReason !== 'toolUse'
      );
    },
  };
}
