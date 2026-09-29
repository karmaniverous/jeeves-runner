/**
 * Lazy `configRoot` resolution and core initialization.
 *
 * @remarks
 * `openclaw plugins install` activates the plugin before `jeeves install`
 * writes its config, so registration must not require `configRoot`. The gate
 * resolves it on demand (plugin config, then `JEEVES_CONFIG_ROOT`), calls
 * core `init()` exactly once when it first resolves, and makes guarded tool
 * calls that read `configRoot` return a clear error until then.
 *
 * @module configRootGate
 */

import {
  fail,
  init,
  type PluginApi,
  resolveWorkspacePath,
  type ToolDescriptor,
} from '@karmaniverous/jeeves';

import {
  CONFIG_ROOT_MISSING_MESSAGE,
  CONFIG_ROOT_UNSET_WARNING,
} from './constants.js';
import { resolveConfigRoot } from './helpers.js';
import type { ConfigRootPredicate } from './toolGating.js';

/** Lazy `configRoot` gate for one plugin registration. */
export interface ConfigRootGate {
  /**
   * Resolve `configRoot` and initialize core on first success.
   *
   * @returns The config root, or `undefined` when it is still unset.
   */
  ensure: () => string | undefined;
  /**
   * Wrap a tool so calls that read `configRoot` return a clear error while
   * it is unset.
   *
   * @param tool - The tool to wrap.
   * @param readsConfigRoot - Per-call predicate; defaults to every call.
   */
  guard: (
    tool: ToolDescriptor,
    readsConfigRoot?: ConfigRootPredicate,
  ) => ToolDescriptor;
}

/**
 * Create the `configRoot` gate and log one warning when it is unset.
 *
 * @param api - OpenClaw plugin API.
 * @returns The gate.
 */
export function createConfigRootGate(api: PluginApi): ConfigRootGate {
  let initializedRoot: string | undefined;

  const ensure = (): string | undefined => {
    if (initializedRoot !== undefined) return initializedRoot;
    const configRoot = resolveConfigRoot(api);
    if (!configRoot) return undefined;
    init({ workspacePath: resolveWorkspacePath(api), configRoot });
    initializedRoot = configRoot;
    return configRoot;
  };

  if (ensure() === undefined) {
    if (api.logger) api.logger.warn(CONFIG_ROOT_UNSET_WARNING);
    else console.warn(CONFIG_ROOT_UNSET_WARNING);
  }

  return {
    ensure,
    guard: (tool, readsConfigRoot = () => true) => ({
      ...tool,
      execute: (id, params) =>
        readsConfigRoot(params) && ensure() === undefined
          ? Promise.resolve(fail(new Error(CONFIG_ROOT_MISSING_MESSAGE)))
          : tool.execute(id, params),
    }),
  };
}
