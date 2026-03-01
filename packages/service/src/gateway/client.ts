/**
 * OpenClaw Gateway HTTP client for spawning and monitoring sessions.
 */

import { httpPost } from '../lib/http.js';

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
  /** Total tokens used. */
  totalTokens: number;
  /** Model name. */
  model: string;
  /** Transcript file path (if available). */
  transcriptPath?: string;
}

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

/** Make an HTTP POST request to the Gateway /tools/invoke endpoint. */
function invokeGateway(
  url: string,
  token: string,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<unknown> {
  const payload = JSON.stringify({ tool, args });
  return httpPost(
    `${url}/tools/invoke`,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    payload,
    timeoutMs,
  );
}

/** Create a Gateway client. */
export function createGatewayClient(
  options: GatewayClientOptions,
): GatewayClient {
  const { url, token, timeoutMs = 30000 } = options;

  return {
    async spawnSession(
      task: string,
      opts?: SpawnSessionOptions,
    ): Promise<SpawnSessionResult> {
      const response = (await invokeGateway(
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
      )) as {
        ok: boolean;
        result: { details: { childSessionKey: string; runId: string } };
      };

      if (!response.ok) {
        throw new Error('Failed to spawn session');
      }

      return {
        sessionKey: response.result.details.childSessionKey,
        runId: response.result.details.runId,
      };
    },

    async getSessionHistory(
      sessionKey: string,
      limit = 3,
    ): Promise<SessionMessage[]> {
      const response = (await invokeGateway(
        url,
        token,
        'sessions_history',
        { sessionKey, limit, includeTools: false },
        timeoutMs,
      )) as { ok: boolean; result: SessionMessage[] };

      if (!response.ok) {
        throw new Error('Failed to get session history');
      }

      return response.result;
    },

    async getSessionInfo(sessionKey: string): Promise<SessionInfo | null> {
      // Note: sessions_list doesn't support filtering by key, so we fetch recent sessions
      // and search client-side. Consider using sessions_history with limit 1 as alternative,
      // or request a sessions_get tool from Gateway for more efficient single-session lookup.
      const response = (await invokeGateway(
        url,
        token,
        'sessions_list',
        { activeMinutes: 120, limit: 500 }, // Increased from 100 to reduce false negatives
        timeoutMs,
      )) as {
        ok: boolean;
        result: Array<{ sessionKey: string } & SessionInfo>;
      };

      if (!response.ok) {
        throw new Error('Failed to list sessions');
      }

      const session = response.result.find((s) => s.sessionKey === sessionKey);
      if (!session) return null;

      return {
        totalTokens: session.totalTokens,
        model: session.model,
        transcriptPath: session.transcriptPath,
      };
    },

    async isSessionComplete(sessionKey: string): Promise<boolean> {
      const history = await this.getSessionHistory(sessionKey, 3);
      if (history.length === 0) return false;

      const lastMessage = history[history.length - 1];
      return (
        lastMessage.role === 'assistant' && lastMessage.stopReason !== undefined
      );
    },
  };
}
