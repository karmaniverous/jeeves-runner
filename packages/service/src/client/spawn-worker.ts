/**
 * OpenClaw Gateway session dispatcher for runner job scripts.
 * Dispatches LLM tasks via a spawned worker process.
 *
 * @module
 */

import { spawn } from 'node:child_process';

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
}

/**
 * Dispatch an LLM session via a worker script.
 * The task prompt is piped to the worker's stdin.
 *
 * @param task - Prompt text for the LLM session.
 * @param options - Dispatch configuration.
 * @param workerPath - Path to the spawn-worker script.
 * @returns Exit code from the worker process.
 */
export function dispatchSession(
  task: string,
  options: DispatchOptions,
  workerPath: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      workerPath,
      `--job-id=${options.jobId}`,
      `--timeout=${String(options.timeout ?? 300)}`,
    ];

    if (options.label) {
      args.push(`--label=${options.label}`);
    }

    if (options.thinking) {
      args.push(`--thinking=${options.thinking}`);
    }

    const child = spawn('node', args, {
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    child.stdin.write(task);
    child.stdin.end();

    child.on('close', (code) => {
      resolve(code ?? 1);
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
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(
        'Dispatcher failed:',
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    });
}
