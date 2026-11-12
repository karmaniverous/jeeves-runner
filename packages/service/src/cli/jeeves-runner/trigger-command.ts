/**
 * The CLI `trigger` command on the SDK (DD#92, DD#96): run one job through `POST /jobs/:id/run` and report the result, or the failure with the error body's message and the 0.14.0-0 exit codes. The job id is URL-encoded; the call waits up to 30 minutes. Network I/O only.
 *
 * @module cli/jeeves-runner/trigger-command
 */

import {
  createRunnerClient,
  type FetchLike,
  isRunnerError,
  TRIGGER_TIMEOUT_MS,
} from '@karmaniverous/jeeves-runner-sdk';

/** Where the command writes. */
export interface TriggerOutput {
  /** Standard output. */
  log: (text: string) => void;
  /** Standard error. */
  error: (text: string) => void;
}

/** Options of {@link triggerCommand}. */
export interface TriggerOptions {
  /** Runner base URL (`getServiceUrl('runner')`). */
  url: string;
  /** Job id. */
  id: string;
  /** Output streams; default the console. */
  output?: TriggerOutput;
  /** `fetch` implementation (tests). */
  fetch?: FetchLike;
  /** Timeout in milliseconds; default 30 minutes (DD#79). */
  timeoutMs?: number;
}

/**
 * Trigger a job and report the outcome.
 *
 * - 2xx: the response body, pretty-printed, on stdout; exit 0.
 * - Non-2xx (404 `RUNNER_JOB_NOT_FOUND`, 409 `RUNNER_MAX_CONCURRENCY`, 500
 *   `RUNNER_TRIGGER_FAILED`; #118, DD#96):
 *   `Trigger failed (HTTP <status>): <the body's message>`; exit 1.
 * - Unreachable runner: `Runner not reachable at <url>. Is it running?`; exit 1.
 * - Timeout or a 2xx that is not a run result:
 *   `Trigger failed: <reason>`; exit 1.
 *
 * @param options - URL, job id, output, fetch and timeout.
 * @returns The exit code.
 */
export async function triggerCommand(options: TriggerOptions): Promise<number> {
  const { url, id, output = console } = options;
  try {
    const runner = createRunnerClient({
      baseUrl: url,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    const body = await runner.triggerJob(
      { id },
      { timeoutMs: options.timeoutMs ?? TRIGGER_TIMEOUT_MS },
    );
    output.log(JSON.stringify(body, null, 2));
    return 0;
  } catch (error) {
    if (isRunnerError(error) && error.status >= 300) {
      output.error(
        `Trigger failed (HTTP ${String(error.status)}): ${error.message}`,
      );
    } else if (
      isRunnerError(error) &&
      (error.code === 'timeout' ||
        error.code === 'invalid_response' ||
        error.code === 'invalid_request')
    ) {
      const note =
        error.code === 'timeout'
          ? ' (the job keeps running on the runner)'
          : '';
      output.error(`Trigger failed: ${error.message}${note}`);
    } else {
      output.error(`Runner not reachable at ${url}. Is it running?`);
    }
    return 1;
  }
}
