/**
 * Session executor for job type='session'. Spawns OpenClaw Gateway sessions and polls for completion.
 */

import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

import type { GatewayClient } from '../gateway/client.js';
import type { ExecutionResult } from './executor.js';

/** Options for executing a session job. */
export interface SessionExecutionOptions {
  /** Script field from job: can be raw prompt, path to .md/.txt, or legacy .js dispatcher. */
  script: string;
  /** Job identifier (used as session label). */
  jobId: string;
  /** Optional execution timeout in milliseconds. */
  timeoutMs?: number;
  /** Gateway client instance. */
  gatewayClient: GatewayClient;
  /** Initial poll interval in milliseconds (default 5000). Exposed for testing. */
  pollIntervalMs?: number;
}

/** File extensions that indicate a script rather than a prompt. */
const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ps1', '.cmd', '.bat'];

/** Resolve task prompt from script field: read file if .md/.txt, return raw text otherwise. */
function resolveTaskPrompt(script: string): string | null {
  const ext = extname(script).toLowerCase();

  // If script extension, caller should fall back to script executor
  if (SCRIPT_EXTENSIONS.includes(ext)) {
    return null;
  }

  // If .md or .txt, read file contents
  if (ext === '.md' || ext === '.txt') {
    if (!existsSync(script)) {
      throw new Error(`Prompt file not found: ${script}`);
    }
    return readFileSync(script, 'utf-8');
  }

  // Otherwise, treat script as raw prompt text
  return script;
}

/** Poll for session completion with exponential backoff (capped). */
async function pollCompletion(
  gatewayClient: GatewayClient,
  sessionKey: string,
  timeoutMs: number,
  initialIntervalMs = 5000,
): Promise<void> {
  const startTime = Date.now();
  let interval = initialIntervalMs;
  const maxInterval = 15000;

  while (Date.now() - startTime < timeoutMs) {
    const isComplete = await gatewayClient.isSessionComplete(sessionKey);
    if (isComplete) return;

    await new Promise((resolve) => setTimeout(resolve, interval));
    interval = Math.min(interval * 1.2, maxInterval); // Exponential backoff capped
  }

  throw new Error(`Session timed out after ${String(timeoutMs)}ms`);
}

/**
 * Execute a session job: spawn a Gateway session, poll for completion, fetch token usage.
 */
export async function executeSession(
  options: SessionExecutionOptions,
): Promise<ExecutionResult> {
  const {
    script,
    jobId,
    timeoutMs = 300000,
    gatewayClient,
    pollIntervalMs,
  } = options;
  const startTime = Date.now();

  try {
    // Resolve task prompt
    const taskPrompt = resolveTaskPrompt(script);
    if (taskPrompt === null) {
      throw new Error(
        'Session job script has script extension; expected prompt text or .md/.txt file',
      );
    }

    // Spawn session
    const { sessionKey } = await gatewayClient.spawnSession(taskPrompt, {
      label: jobId,
      thinking: 'low',
      runTimeoutSeconds: Math.floor(timeoutMs / 1000),
    });

    // Poll for completion
    await pollCompletion(gatewayClient, sessionKey, timeoutMs, pollIntervalMs);

    // Fetch session info for token count
    const sessionInfo = await gatewayClient.getSessionInfo(sessionKey);
    const tokens = sessionInfo?.totalTokens ?? null;

    const durationMs = Date.now() - startTime;

    return {
      status: 'ok',
      exitCode: null,
      durationMs,
      tokens,
      resultMeta: sessionKey,
      stdoutTail: `Session completed: ${sessionKey}`,
      stderrTail: '',
      error: null,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown session error';

    // Check if timeout
    if (errorMessage.includes('timed out')) {
      return {
        status: 'timeout',
        exitCode: null,
        durationMs,
        tokens: null,
        resultMeta: null,
        stdoutTail: '',
        stderrTail: errorMessage,
        error: errorMessage,
      };
    }

    return {
      status: 'error',
      exitCode: null,
      durationMs,
      tokens: null,
      resultMeta: null,
      stdoutTail: '',
      stderrTail: errorMessage,
      error: errorMessage,
    };
  }
}
