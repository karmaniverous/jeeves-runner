/**
 * Service and plugin lifecycle commands for the runner component.
 *
 * @module serviceCommands
 */

import {
  fetchJson,
  type PluginCommands,
  type ServiceCommands,
  type ServiceStatus,
} from '@karmaniverous/jeeves';

/** Health response from GET /health. */
interface HealthResponse {
  ok: boolean;
  uptime: number;
  version?: string;
}

/**
 * Create ServiceCommands for the runner service.
 *
 * @param baseUrl - Runner API base URL.
 * @returns ServiceCommands implementation.
 */
export function createRunnerServiceCommands(baseUrl: string): ServiceCommands {
  return {
    stop(): Promise<void> {
      // Runner doesn't expose a stop endpoint; NSSM handles lifecycle.
      // This is a no-op — the ComponentWriter will log if it matters.
      console.warn(
        '[jeeves-runner] Service stop requested but not supported via API. Use NSSM or the CLI.',
      );
      return Promise.resolve();
    },

    uninstall(): Promise<void> {
      console.warn(
        '[jeeves-runner] Service uninstall requested. Use: jeeves-runner service uninstall',
      );
      return Promise.resolve();
    },

    async status(): Promise<ServiceStatus> {
      try {
        const health = (await fetchJson(`${baseUrl}/health`)) as HealthResponse;
        return {
          running: health.ok,
          version: health.version,
          uptimeSeconds: health.uptime,
        };
      } catch {
        return { running: false };
      }
    },
  };
}

/**
 * Create PluginCommands for the runner plugin.
 *
 * @returns PluginCommands implementation.
 */
export function createRunnerPluginCommands(): PluginCommands {
  return {
    uninstall(): Promise<void> {
      console.warn(
        '[jeeves-runner] Plugin uninstall requested. Use: npx @karmaniverous/jeeves-runner-openclaw uninstall',
      );
      return Promise.resolve();
    },
  };
}
