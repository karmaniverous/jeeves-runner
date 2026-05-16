/**
 * OpenClaw Gateway session dispatcher for runner job scripts.
 * Dispatches LLM tasks via a spawned worker process.
 *
 * @module
 */

import { spawn } from 'node:child_process';

import { resolveCommand } from '../scheduler/executor.js';

/** Options for dispatching an LLM session. */
export interface DispatchOptions {
  /** Job identifier. */
  jobId: string;
  /** Optional session label. */
  label?: string;
  /** Thinking level for the LLM session. */
  thinking?: 'low' | 'medium' | 'high';
  /** Timeout in seconds (default 300). */
  timeout?: number;
  /** Custom command runners keyed by file extension (e.g. `{ ts: "node /path/to/tsx/cli.mjs" }`). */
  runners?: Record<string, string>;
  /** Output channel identifier for routing session results. */
  outputChannel?: string;
}

/** Result of a dispatched session. */
export interface DispatchResult {
  /** Exit code from the worker process. */
  exitCode: number;
  /** Captured stdout from the worker process. */
  stdout: string;
}

/**
 * Dispatch an LLM session via a worker script.
 * The task prompt is piped to the worker's stdin.
 *
 * @param task - Prompt text for the LLM session.
 * @param options - Dispatch configuration.
 * @param workerPath - Path to the spawn-worker script.
 * @returns Exit code and captured stdout from the worker process.
 */
export function dispatchSession(
  task: string,
  options: DispatchOptions,
  workerPath: string,
): Promise<DispatchResult> {
  return new Promise((resolve, reject) => {
    const { command, args: resolvedArgs } = resolveCommand(
      workerPath,
      options.runners,
    );

    const flagArgs = [
      `--job-id=${options.jobId}`,
      `--timeout=${String(options.timeout ?? 300)}`,
    ];

    if (options.label) {
      flagArgs.push(`--label=${options.label}`);
    }

    if (options.thinking) {
      flagArgs.push(`--thinking=${options.thinking}`);
    }

    const child = spawn(command, [...resolvedArgs, ...flagArgs], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    child.stdin.write(task);
    child.stdin.end();

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(chunks).toString(),
      });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Entry point helper for dispatcher scripts.
 * Supports --dry-run for testing.
 *
 * @param task - Prompt text for the LLM session.
 * @param options - Dispatch configuration.
 * @param workerPath - Path to the spawn-worker script.
 */
export function runDispatcher(
  task: string,
  options: DispatchOptions,
  workerPath: string,
): void {
  if (process.argv.includes('--dry-run')) {
    console.log(
      JSON.stringify({
        task,
        label: options.label ?? options.jobId,
        thinking: options.thinking ?? 'low',
        timeout: options.timeout ?? 300,
      }),
    );
    process.exit(0);
  }

  dispatchSession(task, options, workerPath)
    .then(({ exitCode, stdout }) => {
      if (options.outputChannel && stdout.trim()) {
        console.log(
          `JR_RESULT:${JSON.stringify({ output: stdout.trim(), outputChannel: options.outputChannel })}`,
        );
      }
      process.exit(exitCode);
    })
    .catch((err: unknown) => {
      console.error(
        'Dispatcher failed:',
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    });
}
