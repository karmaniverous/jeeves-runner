/**
 * @module createRunnerClient
 * Typed runner API client built on jeeves' catalog client (DD#90): one method per `RUNNER_CATALOG` entry, named by the entry, each taking its input and optional per-call options; every failure is a {@link RunnerError}. Network I/O via fetch.
 */

import {
  type CatalogClient,
  CatalogClientError,
  type CatalogInput,
  type ClientResponse,
  createCatalogClient,
} from '@karmaniverous/jeeves/catalog';
import {
  RUNNER_CATALOG,
  type RunnerCatalog,
} from '@karmaniverous/jeeves-runner-core';

import {
  checkTimeout,
  resolveClientOptions,
  type RunnerClientOptions,
} from './options.js';
import { toRunnerError } from './toRunnerError.js';

/** Options for one call. */
export interface CallOptions {
  /** Timeout of this call in milliseconds (overrides the client's). */
  timeoutMs?: number;
}

/** The client method for catalog entry `E`: input optional when no field is required. */
type MethodOf<E extends RunnerCatalog['entries'][number]> =
  Partial<CatalogInput<E>> extends CatalogInput<E>
    ? (
        input?: CatalogInput<E>,
        options?: CallOptions,
      ) => Promise<ClientResponse<E>>
    : (
        input: CatalogInput<E>,
        options?: CallOptions,
      ) => Promise<ClientResponse<E>>;

/**
 * A runner API client: one method per `RUNNER_CATALOG` entry, named by the
 * entry (`status`, `listJobs`, `triggerJob`, `queryCollection`, ...). Every
 * method validates its input against the entry's schemas before sending,
 * parses the response with the entry's response schema, and throws a
 * {@link RunnerError} on any failure. No retries.
 */
export type RunnerClient = {
  [E in RunnerCatalog['entries'][number] as E['name']]: MethodOf<E>;
};

/**
 * Create a runner API client.
 *
 * @example
 * ```ts
 * const runner = createRunnerClient({ baseUrl: 'http://127.0.0.1:1937' });
 * const { result } = await runner.triggerJob({ id: 'poll-email' });
 * ```
 *
 * @param options - Base URL, timeouts (default 120 s; `triggerJob` 30 min) and `fetch`.
 * @returns A {@link RunnerClient}.
 * @throws {@link RunnerError} `invalid_options` when the options are invalid.
 */
export function createRunnerClient(options: RunnerClientOptions): RunnerClient {
  const resolved = resolveClientOptions(options);

  // jeeves' catalog client takes one timeout, so keep one per timeout used.
  const clients = new Map<number, CatalogClient<RunnerCatalog>>();
  const clientFor = (timeoutMs: number): CatalogClient<RunnerCatalog> => {
    const existing = clients.get(timeoutMs);
    if (existing) return existing;
    const created = createCatalogClient(RUNNER_CATALOG, {
      baseUrl: resolved.baseUrl,
      timeoutMs,
      fetch: resolved.fetch,
    });
    clients.set(timeoutMs, created);
    return created;
  };

  const methods = RUNNER_CATALOG.entries.map(({ name }) => {
    const defaultTimeout =
      name === 'triggerJob' ? resolved.triggerTimeoutMs : resolved.timeoutMs;
    const method = async (input?: unknown, call: CallOptions = {}) => {
      const timeoutMs =
        call.timeoutMs === undefined
          ? defaultTimeout
          : checkTimeout('timeoutMs', call.timeoutMs);
      const send = clientFor(timeoutMs)[name] as (
        input?: unknown,
      ) => Promise<unknown>;
      try {
        return await send(input);
      } catch (error) {
        const text =
          error instanceof CatalogClientError && error.headers
            ? resolved.errorTexts.get(error.headers)
            : undefined;
        throw toRunnerError(error, name, timeoutMs, text);
      }
    };
    return [name, method] as const;
  });
  return Object.fromEntries(methods) as unknown as RunnerClient;
}
