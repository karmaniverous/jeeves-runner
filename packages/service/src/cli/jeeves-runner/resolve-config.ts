/**
 * Config resolution for the custom CLI commands (DD#81, #122).
 *
 * `workspace` and `configRoot` follow jeeves' shared precedence: flag, then
 * `JEEVES_WORKSPACE` / `JEEVES_CONFIG_ROOT`, then `core.*` in the
 * workspace's `jeeves.config.json`, then the defaults (`.`, `./config`).
 * jeeves 0.7.0 does not export its `resolveCliConfig()`, so this composes
 * the exported `loadWorkspaceConfig()` and `resolveConfigValue()` the same
 * way.
 *
 * DB-touching commands use `-c <path>` when given; otherwise
 * `{configRoot}/jeeves-runner/config.json`, the file `jeeves-runner init`
 * writes. When there is no config file they refuse instead of falling back
 * to schema defaults (a cwd-relative `./data/runner.sqlite`).
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  getComponentConfigDir,
  init,
  loadWorkspaceConfig,
  rejectWindowsDrivePath,
  resolveConfigValue,
  type ResolvedValue,
  WORKSPACE_CONFIG_DEFAULTS,
} from '@karmaniverous/jeeves';

import type { RunnerConfig } from '../../schemas/config.js';
import { loadConfig } from './config-helpers.js';

/** `-w/--workspace` and `--config-root` as parsed (no commander defaults). */
export interface RootOptions {
  /** Workspace root path flag. */
  workspace?: string;
  /** Platform config root path flag. */
  configRoot?: string;
}

/** Options of a DB-touching command. */
export interface ConfigOptions extends RootOptions {
  /** `-c/--config` flag. */
  config?: string;
}

/** Resolved workspace and config root, with provenance. */
export interface ResolvedRoots {
  /** Workspace root. */
  workspace: ResolvedValue<string>;
  /** Platform config root. */
  configRoot: ResolvedValue<string>;
}

/** A found and loaded runner config. */
export interface ResolvedRunnerConfig {
  /** Absolute path of the config file. */
  configPath: string;
  /** Parsed config. */
  config: RunnerConfig;
  /** Absolute database path (`dbPath` resolved against the cwd, as the runner does). */
  dbPath: string;
}

/** No config file where a DB-touching command looked for one. */
export class ConfigNotFoundError extends Error {
  /** @param message - Names the path tried and how to fix it. */
  constructor(message: string) {
    super(message);
    this.name = 'ConfigNotFoundError';
  }
}

/**
 * Resolve `workspace` and `configRoot` by flag, env, `jeeves.config.json`,
 * then default.
 */
export function resolveRoots(
  opts: RootOptions,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRoots {
  const { workspace: defaultWorkspace, configRoot: defaultConfigRoot } =
    WORKSPACE_CONFIG_DEFAULTS.core;
  const seed = resolveConfigValue<string>(
    opts.workspace,
    env['JEEVES_WORKSPACE'],
    undefined,
    defaultWorkspace,
  );
  const file = loadWorkspaceConfig(seed.value);
  return {
    workspace: resolveConfigValue<string>(
      opts.workspace,
      env['JEEVES_WORKSPACE'],
      file?.core?.workspace,
      defaultWorkspace,
    ),
    configRoot: resolveConfigValue<string>(
      opts.configRoot,
      env['JEEVES_CONFIG_ROOT'],
      file?.core?.configRoot,
      defaultConfigRoot,
    ),
  };
}

/** Resolve the roots and initialise jeeves core with them. */
export function initRoots(opts: RootOptions): ResolvedRoots {
  const roots = resolveRoots(opts);
  // Check raw values before resolve(): on Linux, resolve('j:/x') hides the drive letter.
  rejectWindowsDrivePath('configRoot', roots.configRoot.value);
  rejectWindowsDrivePath('workspacePath', roots.workspace.value);
  init({
    workspacePath: resolve(roots.workspace.value),
    configRoot: resolve(roots.configRoot.value),
  });
  return roots;
}

/** Say where a resolved `configRoot` came from. */
function describeProvenance(roots: ResolvedRoots): string {
  switch (roots.configRoot.provenance) {
    case 'flag':
      return 'the --config-root flag';
    case 'env':
      return 'JEEVES_CONFIG_ROOT';
    case 'file':
      return `core.configRoot in ${join(resolve(roots.workspace.value), 'jeeves.config.json')}`;
    case 'default':
      return 'the default; no flag, JEEVES_CONFIG_ROOT or jeeves.config.json set it';
  }
}

/**
 * Find and load the runner config for a DB-touching command, initialising
 * jeeves core with the resolved roots.
 *
 * @throws ConfigNotFoundError when the file is missing.
 */
export function resolveRunnerConfig(opts: ConfigOptions): ResolvedRunnerConfig {
  const roots = initRoots(opts);

  let configPath: string;
  if (opts.config) {
    configPath = resolve(opts.config);
    if (!existsSync(configPath)) {
      throw new ConfigNotFoundError(
        `Config file not found: ${configPath} (from -c/--config).`,
      );
    }
  } else {
    configPath = join(getComponentConfigDir('runner'), 'config.json');
    if (!existsSync(configPath)) {
      throw new ConfigNotFoundError(
        [
          `No jeeves-runner config found at ${configPath}.`,
          `configRoot "${roots.configRoot.value}" came from ${describeProvenance(roots)}.`,
          "Pass -c <path>, set --config-root or JEEVES_CONFIG_ROOT, or run 'jeeves-runner init'.",
        ].join('\n'),
      );
    }
  }

  const config = loadConfig(configPath);
  return { configPath, config, dbPath: resolve(config.dbPath) };
}

/** Where a command writes its diagnostics (both go to stderr by default). */
export interface CommandDiagnostics {
  /** Failures. */
  error: (message: string) => void;
  /** Informational lines that must stay off stdout. */
  info: (message: string) => void;
}

/** Diagnostics on stderr, keeping stdout for the command's output. */
export const stderrDiagnostics: CommandDiagnostics = {
  error: (message) => {
    console.error(message);
  },
  info: (message) => {
    console.error(message);
  },
};

/**
 * Resolve the config for a DB-touching command and print the absolute
 * config and database paths it will use. When no config is found, report
 * why and return `undefined`; the caller exits 1.
 */
export function resolveForCommand(
  opts: ConfigOptions,
  out: CommandDiagnostics = stderrDiagnostics,
): ResolvedRunnerConfig | undefined {
  let resolved: ResolvedRunnerConfig;
  try {
    resolved = resolveRunnerConfig(opts);
  } catch (err) {
    if (err instanceof ConfigNotFoundError) {
      out.error(err.message);
      return undefined;
    }
    throw err;
  }
  out.info(`Config: ${resolved.configPath}`);
  out.info(`Database: ${resolved.dbPath}`);
  return resolved;
}
